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
            // First check if the feature is enabled in guild_features table
            const featureEnabled = await hasFeature(guildId, 'ai_summarization');
            if (!featureEnabled) {
                return false;
            }

            // Then check if AI is configured and enabled in guild_ai_config table
            const config = await this.getGuildConfig(guildId);
            return config && config.enabled;
        } catch (error) {
            console.error('[AI-SERVICE] Error checking feature status:', error);
            return false;
        }
    }

    async checkUserPermission(guildId, userId, member) {
        try {
            // Check if feature is enabled first
            if (!await this.isFeatureEnabled(guildId)) {
                return { allowed: false, reason: 'Feature not enabled' };
            }

            // Get user's roles
            const userRoles = member?.roles?.cache?.map(role => role.id) || [];
            
            // Check if user has any allowed roles
            const db = require('../config/database');
            const pool = db.appDb || db.pool || db;
            
            const [permissionRows] = await pool.execute(`
                SELECT allowed FROM feature_role_permissions 
                WHERE guild_id = ? AND feature_key = ? AND role_id IN (${userRoles.map(() => '?').join(',')})
            `, [guildId, 'ai_summarization', ...userRoles]);

            // If no specific permissions found, check if there are any permissions set for this feature
            if (permissionRows.length === 0) {
                const [hasPermissions] = await pool.execute(`
                    SELECT COUNT(*) as count FROM feature_role_permissions 
                    WHERE guild_id = ? AND feature_key = ?
                `, [guildId, 'ai_summarization']);

                // If no permissions are set, allow by default
                if (hasPermissions[0].count === 0) {
                    return { allowed: true, reason: 'No restrictions set' };
                } else {
                    // If permissions exist but user has no roles, deny
                    return { allowed: false, reason: 'No allowed roles' };
                }
            }

            // Check if any of the user's roles are allowed
            const hasAllowedRole = permissionRows.some(row => row.allowed);
            
            if (hasAllowedRole) {
                return { allowed: true, reason: 'Role permission granted' };
            } else {
                return { allowed: false, reason: 'Role not allowed' };
            }

        } catch (error) {
            console.error('[AI-SERVICE] Error checking user permission:', error);
            return { allowed: false, reason: 'Permission check failed' };
        }
    }

    async getGuildConfig(guildId) {
        try {
            const db = require('../config/database');
            const pool = db.appDb || db.pool || db;
            const [rows] = await pool.execute(
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
            const pool = db.appDb || db.pool || db;
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // Get current rate limit status
            const [rateLimitRows] = await pool.execute(
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
            const pool = db.appDb || db.pool || db;
            const now = new Date();
            await pool.execute(`
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
            const pool = db.appDb || db.pool || db;
            await pool.execute(`
                INSERT INTO guild_ai_usage (guild_id, user_id, command_type, channel_id, message_count, tokens_used, cost_usd, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [guildId, userId, commandType, channelId, messageCount, tokensUsed, cost, success, errorMessage]);
        } catch (error) {
            console.error('[AI-SERVICE] Error logging usage:', error);
        }
    }

    async summarizeMessages(messages, guildId, userId, channelId, commandType = 'summarise', supplementaryPrompt = null) {
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

            // Prepare messages for OpenAI with length filtering
            const formattedMessages = messages.map(msg => {
                const timestamp = new Date(msg.createdTimestamp).toLocaleString();
                // Truncate individual messages if they're too long (Discord limit is 2000 chars)
                const content = msg.content.length > 1500 ? msg.content.substring(0, 1500) + '...' : msg.content;
                return `[${timestamp}] ${msg.author.username}: ${content}`;
            }).join('\n');

            // Check total message length and truncate if necessary
            const maxMessageLength = config.max_tokens_per_request * 3; // Rough estimate: 3 chars per token
            let finalMessages = formattedMessages;
            
            if (formattedMessages.length > maxMessageLength) {
                console.log(`[AI-SERVICE] Messages too long (${formattedMessages.length} chars), truncating to ${maxMessageLength} chars`);
                
                // Try to truncate at a message boundary if possible
                const truncatedAt = formattedMessages.substring(0, maxMessageLength).lastIndexOf('\n');
                if (truncatedAt > maxMessageLength * 0.8) { // If we can find a good break point
                    finalMessages = formattedMessages.substring(0, truncatedAt) + '\n\n[Message truncated due to length limit]';
                } else {
                    finalMessages = formattedMessages.substring(0, maxMessageLength) + '\n\n[Message truncated due to length limit]';
                }
            }

            // Build the system prompt from base config plus any supplementary prompt from the user
            const basePrompt = config.custom_prompt || 'Summarize the following Discord messages in a clear, concise way. Focus on the main topics, decisions, and key points discussed. Keep the summary under 500 words.';
            const trimmedSupplement = (typeof supplementaryPrompt === 'string' ? supplementaryPrompt.trim() : '');
            const systemPrompt = trimmedSupplement && trimmedSupplement.length > 0
                ? `${basePrompt}\n\nAdditional instructions from the requester:\n${trimmedSupplement}`
                : basePrompt;

            // Call OpenAI API
            if (!this.openai) {
                throw new Error('OpenAI service not available');
            }

            const completion = await this.openai.chat.completions.create({
                model: config.model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: finalMessages
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
            const pool = db.appDb || db.pool || db;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const [rows] = await pool.execute(`
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
            const pool = db.appDb || db.pool || db;
            const [rows] = await pool.execute(`
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
