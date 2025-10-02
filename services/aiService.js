const { OpenAI } = require('openai');
const { hasFeature } = require('../utils/features');

class AIService {
    constructor() {
        this.openai = null;
        this.initializeOpenAI();
    }

    initializeOpenAI() {
        try {
            // Get API key from environment or database
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                console.log('[AI-SERVICE] OpenAI API key not found in environment variables');
                return;
            }

            this.openai = new OpenAI({
                apiKey: apiKey,
            });
            console.log('[AI-SERVICE] OpenAI client initialized successfully');
        } catch (error) {
            console.error('[AI-SERVICE] Failed to initialize OpenAI client:', error);
        }
    }

    async isFeatureEnabled(guildId) {
        try {
            return await hasFeature(guildId, 'ai_summarization');
        } catch (error) {
            console.error('[AI-SERVICE] Error checking feature status:', error);
            return false;
        }
    }

    async getGuildConfig(guildId) {
        try {
            const db = require('../config/database');
            const [rows] = await db.execute(
                'SELECT * FROM guild_ai_config WHERE guild_id = ? LIMIT 1',
                [guildId]
            );
            
            if (rows.length === 0) {
                // Return default config
                return {
                    enabled: false,
                    model: 'gpt-3.5-turbo',
                    max_tokens_per_request: 1000,
                    max_messages_per_summary: 50,
                    custom_prompt: null,
                    rate_limit_per_hour: 10,
                    rate_limit_per_day: 100
                };
            }
            
            return rows[0];
        } catch (error) {
            console.error('[AI-SERVICE] Error getting guild config:', error);
            return null;
        }
    }

    async checkRateLimit(guildId, userId) {
        try {
            const config = await this.getGuildConfig(guildId);
            if (!config) return { allowed: false, reason: 'Configuration error' };

            const db = require('../config/database');
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // Get current rate limit status
            const [rateLimitRows] = await db.execute(
                'SELECT * FROM guild_ai_rate_limits WHERE guild_id = ? AND user_id = ? LIMIT 1',
                [guildId, userId]
            );

            let rateLimit = rateLimitRows[0] || {
                guild_id: guildId,
                user_id: userId,
                request_count_hour: 0,
                request_count_day: 0,
                last_request_hour: null,
                last_request_day: null
            };

            // Reset counters if time windows have passed
            if (rateLimit.last_request_hour && new Date(rateLimit.last_request_hour) < oneHourAgo) {
                rateLimit.request_count_hour = 0;
            }
            if (rateLimit.last_request_day && new Date(rateLimit.last_request_day) < oneDayAgo) {
                rateLimit.request_count_day = 0;
            }

            // Check limits
            if (rateLimit.request_count_hour >= config.rate_limit_per_hour) {
                return { 
                    allowed: false, 
                    reason: `Hourly limit reached (${config.rate_limit_per_hour} requests/hour)`,
                    resetTime: new Date(rateLimit.last_request_hour.getTime() + 60 * 60 * 1000)
                };
            }

            if (rateLimit.request_count_day >= config.rate_limit_per_day) {
                return { 
                    allowed: false, 
                    reason: `Daily limit reached (${config.rate_limit_per_day} requests/day)`,
                    resetTime: new Date(rateLimit.last_request_day.getTime() + 24 * 60 * 60 * 1000)
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('[AI-SERVICE] Error checking rate limit:', error);
            return { allowed: false, reason: 'Rate limit check failed' };
        }
    }

    async updateRateLimit(guildId, userId) {
        try {
            const db = require('../config/database');
            const now = new Date();
            
            await db.execute(`
                INSERT INTO guild_ai_rate_limits (guild_id, user_id, request_count_hour, request_count_day, last_request_hour, last_request_day)
                VALUES (?, ?, 1, 1, ?, ?)
                ON DUPLICATE KEY UPDATE
                    request_count_hour = request_count_hour + 1,
                    request_count_day = request_count_day + 1,
                    last_request_hour = VALUES(last_request_hour),
                    last_request_day = VALUES(last_request_day)
            `, [guildId, userId, now, now]);
        } catch (error) {
            console.error('[AI-SERVICE] Error updating rate limit:', error);
        }
    }

    async logUsage(guildId, userId, commandType, channelId, messageCount, tokensUsed, cost, success, errorMessage = null) {
        try {
            const db = require('../config/database');
            await db.execute(`
                INSERT INTO guild_ai_usage (guild_id, user_id, command_type, channel_id, message_count, tokens_used, cost_usd, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [guildId, userId, commandType, channelId, messageCount, tokensUsed, cost, success, errorMessage]);
        } catch (error) {
            console.error('[AI-SERVICE] Error logging usage:', error);
        }
    }

    async summarizeMessages(messages, guildId, userId, channelId, commandType = 'summarise') {
        try {
            // Check if feature is enabled
            if (!await this.isFeatureEnabled(guildId)) {
                throw new Error('AI summarization feature is not enabled for this server');
            }

            // Check rate limits
            const rateLimitCheck = await this.checkRateLimit(guildId, userId);
            if (!rateLimitCheck.allowed) {
                throw new Error(rateLimitCheck.reason);
            }

            // Get guild configuration
            const config = await this.getGuildConfig(guildId);
            if (!config || !config.enabled) {
                throw new Error('AI summarization is not configured for this server');
            }

            // Validate message count
            if (messages.length > config.max_messages_per_summary) {
                throw new Error(`Too many messages. Maximum allowed: ${config.max_messages_per_summary}`);
            }

            // Prepare messages for OpenAI
            const formattedMessages = messages.map(msg => {
                const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                return `[${timestamp}] ${msg.author.username}: ${msg.content}`;
            }).join('\n');

            // Check total message length
            if (formattedMessages.length > 4000) {
                throw new Error('Messages too long to process. Please reduce the number of messages.');
            }

            // Use custom prompt or default
            const prompt = config.custom_prompt || 
                'Summarize the following Discord messages in a clear, concise way. Focus on the main topics, decisions, and key points discussed. Keep the summary under 500 words.';

            // Call OpenAI API
            if (!this.openai) {
                throw new Error('OpenAI service not available');
            }

            const completion = await this.openai.chat.completions.create({
                model: config.model,
                messages: [
                    {
                        role: 'system',
                        content: prompt
                    },
                    {
                        role: 'user',
                        content: formattedMessages
                    }
                ],
                max_tokens: config.max_tokens_per_request,
                temperature: 0.7
            });

            const summary = completion.choices[0].message.content;
            const tokensUsed = completion.usage.total_tokens;
            
            // Calculate cost (approximate)
            const costPer1kTokens = config.model.includes('gpt-4') ? 0.03 : 0.002;
            const cost = (tokensUsed / 1000) * costPer1kTokens;

            // Update rate limit
            await this.updateRateLimit(guildId, userId);

            // Log usage
            await this.logUsage(guildId, userId, commandType, channelId, messages.length, tokensUsed, cost, true);

            return {
                summary,
                tokensUsed,
                cost,
                messageCount: messages.length
            };

        } catch (error) {
            console.error('[AI-SERVICE] Error summarizing messages:', error);
            
            // Log failed usage
            await this.logUsage(guildId, userId, commandType, channelId, messages.length, 0, 0, false, error.message);
            
            throw error;
        }
    }

    async getUsageStats(guildId, days = 30) {
        try {
            const db = require('../config/database');
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const [rows] = await db.execute(`
                SELECT 
                    COUNT(*) as total_requests,
                    SUM(tokens_used) as total_tokens,
                    SUM(cost_usd) as total_cost,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
                    AVG(tokens_used) as avg_tokens_per_request,
                    AVG(cost_usd) as avg_cost_per_request
                FROM guild_ai_usage 
                WHERE guild_id = ? AND created_at >= ?
            `, [guildId, startDate]);

            return rows[0] || {
                total_requests: 0,
                total_tokens: 0,
                total_cost: 0,
                successful_requests: 0,
                failed_requests: 0,
                avg_tokens_per_request: 0,
                avg_cost_per_request: 0
            };
        } catch (error) {
            console.error('[AI-SERVICE] Error getting usage stats:', error);
            return null;
        }
    }

    async getRecentUsage(guildId, limit = 10) {
        try {
            const db = require('../config/database');
            const [rows] = await db.execute(`
                SELECT 
                    user_id,
                    command_type,
                    channel_id,
                    message_count,
                    tokens_used,
                    cost_usd,
                    success,
                    error_message,
                    created_at
                FROM guild_ai_usage 
                WHERE guild_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `, [guildId, limit]);

            return rows;
        } catch (error) {
            console.error('[AI-SERVICE] Error getting recent usage:', error);
            return [];
        }
    }
}

module.exports = { AIService };
