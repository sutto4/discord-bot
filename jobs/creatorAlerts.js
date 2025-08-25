const { appDb } = require('../config/database');
const fetch = require('node-fetch');

// Twitch API configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_TOKEN_URL = process.env.TWITCH_TOKEN_URL || 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_BASE = process.env.TWITCH_API_BASE || 'https://api.twitch.tv/helix';

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// YouTube token management (API key doesn't expire, but we'll keep the pattern)
let youtubeApiKey = YOUTUBE_API_KEY;

/**
 * Get YouTube API key
 */
async function getYouTubeToken() {
    if (!youtubeApiKey) {
        throw new Error('[CREATOR-ALERTS] YouTube API key not configured');
    }
    return youtubeApiKey;
}

// Kick API configuration (using their public API)
const KICK_API_BASE = 'https://kick.com/api/v1';

// TikTok API configuration (using their public API)
const TIKTOK_API_BASE = 'https://www.tiktok.com/api';

const POLL_INTERVAL = parseInt(process.env.CREATOR_ALERTS_POLL_SECONDS || '60') * 1000; // Default 60 seconds

let twitchAccessToken = null;
let twitchTokenExpiry = 0;

/**
 * Get or refresh Twitch access token
 */
async function getTwitchToken() {
    const now = Date.now();
    
    // If token is still valid, return it
    if (twitchAccessToken && now < twitchTokenExpiry) {
        return twitchAccessToken;
    }
    
    try {
        const response = await fetch(TWITCH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get Twitch token: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        twitchAccessToken = data.access_token;
        twitchTokenExpiry = now + (data.expires_in * 1000) - 60000; // Expire 1 minute early
        
        return twitchAccessToken;
    } catch (error) {
        console.error('[CREATOR-ALERTS] Error refreshing Twitch token:', error);
        throw error;
    }
}

/**
 * Get Twitch user ID from username
 */
async function getTwitchUserId(username) {
    try {
        const token = await getTwitchToken();
        
        const response = await fetch(`${TWITCH_API_BASE}/users?login=${encodeURIComponent(username)}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get Twitch user: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data[0]?.id || null;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting Twitch user ID for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a Twitch user is currently live
 */
async function isTwitchUserLive(userId) {
    try {
        const token = await getTwitchToken();
        
        const response = await fetch(`${TWITCH_API_BASE}/streams?user_id=${userId}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get Twitch streams: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data[0] || null; // Returns stream data if live, null if offline
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error checking Twitch stream for user ${userId}:`, error);
        return null;
    }
}

/**
 * Assign Discord role to user
 */
async function assignDiscordRole(client, guildId, userId, roleId, platform) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found`);
            return false;
        }
        
        // Check if bot has MANAGE_ROLES permission
        if (!guild.members.me.permissions.has('ManageRoles')) {
            console.error(`[CREATOR-ALERTS] Bot does not have MANAGE_ROLES permission in guild ${guild.name}`);
            return false;
        }
        
        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error(`[CREATOR-ALERTS] Member ${userId} not found in guild ${guildId}`);
            return false;
        }
        
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.error(`[CREATOR-ALERTS] Role ${roleId} not found in guild ${guildId}`);
            return false;
        }
        
        // Check if bot can manage this role (role must be lower than bot's highest role)
        if (role.position >= guild.members.me.roles.highest.position) {
            console.error(`[CREATOR-ALERTS] Cannot assign role ${role.name} - it's higher than or equal to bot's highest role in guild ${guild.name}`);
            return false;
        }
        
        if (member.roles.cache.has(roleId)) {
            console.log(`[CREATOR-ALERTS] User ${userId} already has role ${role.name} in guild ${guild.name}`);
            return true;
        }
        
        await member.roles.add(roleId, `Creator Alert: User went live on ${platform}`);
        console.log(`[CREATOR-ALERTS] Assigned role ${role.name} to user ${userId} in guild ${guild.name}`);
        return true;
    } catch (error) {
        if (error.code === 50013) {
            console.error(`[CREATOR-ALERTS] Missing permissions to assign role ${roleId} in guild ${guildId}. Bot needs MANAGE_ROLES permission and the role must be lower than bot's highest role.`);
        } else {
            console.error(`[CREATOR-ALERTS] Error assigning role ${roleId} to user ${userId} in guild ${guildId}:`, error);
        }
        return false;
    }
}

/**
 * Remove Discord role from user
 */
async function removeDiscordRole(client, guildId, userId, roleId, platform) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found`);
            return false;
        }
        
        // Check if bot has MANAGE_ROLES permission
        if (!guild.members.me.permissions.has('ManageRoles')) {
            console.error(`[CREATOR-ALERTS] Bot does not have MANAGE_ROLES permission in guild ${guild.name}`);
            return false;
        }
        
        const member = await guild.members.fetch(userId);
        if (!member) {
            console.error(`[CREATOR-ALERTS] Member ${userId} not found in guild ${guildId}`);
            return false;
        }
        
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.error(`[CREATOR-ALERTS] Role ${roleId} not found in guild ${guildId}`);
            return false;
        }
        
        // Check if bot can manage this role (role must be lower than bot's highest role)
        if (role.position >= guild.members.me.roles.highest.position) {
            console.error(`[CREATOR-ALERTS] Cannot remove role ${role.name} - it's higher than or equal to bot's highest role in guild ${guild.name}`);
            return false;
        }
        
        if (!member.roles.cache.has(roleId)) {
            console.log(`[CREATOR-ALERTS] User ${userId} doesn't have role ${roleId} in guild ${guild.name}`);
            return true;
        }
        
        await member.roles.remove(roleId, `Creator Alert: User went offline on ${platform}`);
        console.log(`[CREATOR-ALERTS] Removed role ${role.name} from user ${userId} in guild ${guild.name}`);
        return true;
    } catch (error) {
        if (error.code === 50013) {
            console.error(`[CREATOR-ALERTS] Missing permissions to remove role ${roleId} in guild ${guildId}. Bot needs MANAGE_ROLES permission and the role must be lower than bot's highest role.`);
        } else {
            console.error(`[CREATOR-ALERTS] Error removing role ${roleId} from user ${userId} in guild ${guildId}:`, error);
        }
        return false;
    }
}

/**
 * Send live notification to Discord channel
 */
async function sendLiveNotification(client, guildId, channelId, creator, streamData, discordUserId, platform) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found`);
            return false;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            console.error(`[CREATOR-ALERTS] Channel ${channelId} not found in guild ${guild.name}`);
            return false;
        }

        // Platform-specific configuration
        const platformConfig = {
            twitch: {
                color: 0x9146FF,
                title: '🔴 Twitch Stream Started!',
                icon: '🎮',
                url: `https://twitch.tv/${creator}`,
                getThumbnail: () => streamData?.thumbnail_url || streamData?.thumbnails?.medium?.url
            },
            youtube: {
                color: 0xFF0000,
                title: '🔴 YouTube Stream Started!',
                icon: '📺',
                url: `https://youtube.com/watch?v=${streamData?.id}`,
                getThumbnail: () => streamData?.thumbnails?.high?.url || streamData?.thumbnails?.medium?.url
            },
            kick: {
                color: 0x0077B6,
                title: '🔴 Kick Stream Started!',
                icon: '👋',
                url: `https://kick.com/${creator}`,
                getThumbnail: () => null // Kick doesn't provide thumbnails in their public API
            },
            tiktok: {
                color: 0x00F2EA,
                title: '🔴 TikTok Live Started!',
                icon: '📱',
                url: `https://tiktok.com/@${creator}`,
                getThumbnail: () => null // TikTok doesn't provide thumbnails in their public API
            }
        };

        const config = platformConfig[platform] || platformConfig.twitch;
        const thumbnailUrl = config.getThumbnail();

        // Create rich embed
        const embed = {
            color: config.color,
            title: config.title,
            url: config.url,
            description: `**${creator}** is now live streaming!`,
            fields: [],
            thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
            timestamp: new Date().toISOString(),
            footer: {
                text: `ServerMate Creator Alerts • ${platform.charAt(0).toUpperCase() + platform.slice(1)}`
            }
        };

        // Add platform-specific fields
        if (platform === 'youtube' && streamData) {
            if (streamData.title) {
                embed.fields.push({
                    name: '📝 Stream Title',
                    value: streamData.title.length > 100 ? streamData.title.substring(0, 97) + '...' : streamData.title,
                    inline: false
                });
            }
            
            if (streamData.description) {
                const description = streamData.description.length > 200 ? streamData.description.substring(0, 197) + '...' : streamData.description;
                embed.fields.push({
                    name: '📄 Description',
                    value: description,
                    inline: false
                });
            }
            
            if (streamData.category && streamData.category !== 'Unknown') {
                embed.fields.push({
                    name: '🏷️ Category',
                    value: streamData.category,
                    inline: true
                });
            }
            
            if (streamData.viewerCount > 0) {
                embed.fields.push({
                    name: '👥 Viewers',
                    value: streamData.viewerCount.toLocaleString(),
                    inline: true
                });
            }
            
            if (streamData.language && streamData.language !== 'Unknown') {
                embed.fields.push({
                    name: '🌐 Language',
                    value: streamData.language,
                    inline: true
                });
            }
            
            if (streamData.tags && streamData.tags.length > 0) {
                const tags = streamData.tags.slice(0, 5).join(', ');
                embed.fields.push({
                    name: '🏷️ Tags',
                    value: tags.length > 100 ? tags.substring(0, 97) + '...' : tags,
                    inline: false
                });
            }
        } else if (platform === 'twitch' && streamData) {
            if (streamData.title) {
                embed.fields.push({
                    name: '📝 Stream Title',
                    value: streamData.title.length > 100 ? streamData.title.substring(0, 97) + '...' : streamData.title,
                    inline: false
                });
            }
            
            if (streamData.game_name) {
                embed.fields.push({
                    name: '🎮 Game',
                    value: streamData.game_name,
                    inline: true
                });
            }
            
            if (streamData.viewer_count) {
                embed.fields.push({
                    name: '👥 Viewers',
                    value: streamData.viewer_count.toLocaleString(),
                    inline: true
                });
            }
            
            if (streamData.language) {
                embed.fields.push({
                    name: '🌐 Language',
                    value: streamData.language,
                    inline: true
                });
            }
        } else if (platform === 'kick' && streamData) {
            if (streamData.title) {
                embed.fields.push({
                    name: '📝 Stream Title',
                    value: streamData.title.length > 100 ? streamData.title.substring(0, 97) + '...' : streamData.title,
                    inline: false
                });
            }
            
            if (streamData.category) {
                embed.fields.push({
                    name: '🎮 Category',
                    value: streamData.category,
                    inline: true
                });
            }
            
            if (streamData.viewerCount > 0) {
                embed.fields.push({
                    name: '👥 Viewers',
                    value: streamData.viewerCount.toLocaleString(),
                    inline: true
                });
            }
        } else if (platform === 'tiktok' && streamData) {
            if (streamData.title) {
                embed.fields.push({
                    name: '📝 Stream Title',
                    value: streamData.title.length > 100 ? streamData.title.substring(0, 97) + '...' : streamData.title,
                    inline: false
                });
            }
            
            if (streamData.category) {
                embed.fields.push({
                    name: '📱 Category',
                    value: streamData.category,
                    inline: true
                });
            }
        }

        // Add role mention if specified
        let content = '';
        if (discordUserId) {
            content = `<@${discordUserId}>, you have a creator alert!`;
        }

        // Send the notification
        await channel.send({ content, embeds: [embed] });
        console.log(`[CREATOR-ALERTS] Live notification sent for ${creator} on ${platform} in guild ${guild.name}`);
        return true;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error sending live notification for ${creator} on ${platform}:`, error);
        return false;
    }
}

/**
 * Send Discord notification about creator going offline
 */
async function sendOfflineNotification(client, guildId, channelId, creatorName) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found for offline notification`);
            return false;
        }
        
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            console.error(`[CREATOR-ALERTS] Channel ${channelId} not found in guild ${guildId}`);
            return false;
        }
        
        const embed = {
            color: 0x6C757D, // Gray
            title: `📺 ${creatorName} has gone offline`,
            description: 'The stream has ended.',
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Creator Alerts • ServerMate'
            }
        };
        
        await channel.send({
            content: `📺 **${creatorName}** has gone offline on Twitch.`,
            embeds: [embed]
        });
        
        console.log(`[CREATOR-ALERTS] Sent offline notification for ${creatorName} in guild ${guild.name}`);
        return true;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error sending offline notification for ${creatorName} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Initialize cache from database on startup
 */
async function initializeCache() {
    try {
        // Load existing cache from database
        const [cacheRows] = await appDb.query(`SELECT * FROM creator_alert_cache`);
        
        if (!global.creatorAlertCache) global.creatorAlertCache = {};
        
        cacheRows.forEach(row => {
            global.creatorAlertCache[row.cache_key] = {
                live: row.live === 1,
                timestamp: row.timestamp,
                streamStartedAt: row.stream_started_at,
                streamId: row.stream_id,
                lastNotificationSent: row.last_notification_sent
            };
        });
        
        console.log(`[CREATOR-ALERTS] Loaded ${cacheRows.length} cache entries from database`);
    } catch (error) {
        console.error('[CREATOR-ALERTS] Error initializing cache:', error);
        // If table doesn't exist, start with empty cache
        if (!global.creatorAlertCache) global.creatorAlertCache = {};
        console.log('[CREATOR-ALERTS] Starting with empty cache');
    }
}

/**
 * Update cache in database
 */
async function updateCacheInDb(cacheKey, cacheData) {
    try {
        await appDb.query(`
            INSERT INTO creator_alert_cache 
                (cache_key, live, timestamp, stream_started_at, stream_id, last_notification_sent) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                live = VALUES(live),
                timestamp = VALUES(timestamp),
                stream_started_at = VALUES(stream_started_at),
                stream_id = VALUES(stream_id),
                last_notification_sent = VALUES(last_notification_sent),
                updated_at = CURRENT_TIMESTAMP
        `, [
            cacheKey,
            cacheData.live ? 1 : 0,
            cacheData.timestamp,
            cacheData.streamStartedAt || null,
            cacheData.streamId || null,
            cacheData.lastNotificationSent
        ]);
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error updating cache in database for ${cacheKey}:`, error);
    }
}

/**
 * Clear all cache data (useful for testing)
 */
async function clearAllCache() {
    try {
        // Clear in-memory cache
        global.creatorAlertCache = {};
        
        // Clear database cache
        await appDb.query(`DELETE FROM creator_alert_cache`);
        
        console.log('[CREATOR-ALERTS] All cache cleared successfully');
    } catch (error) {
        console.error('[CREATOR-ALERTS] Error clearing cache:', error);
    }
}

/**
 * Clear cache for a specific guild
 */
async function clearGuildCache(guildId) {
    try {
        // Clear in-memory cache for this guild
        if (global.creatorAlertCache) {
            Object.keys(global.creatorAlertCache).forEach(key => {
                if (key.startsWith(`creator_alert_${guildId}_`)) {
                    delete global.creatorAlertCache[key];
                }
            });
        }
        
        // Clear database cache for this guild
        await appDb.query(
            `DELETE FROM creator_alert_cache WHERE cache_key LIKE ?`,
            [`creator_alert_${guildId}_%`]
        );
        
        console.log(`[CREATOR-ALERTS] Cache cleared for guild ${guildId}`);
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error clearing cache for guild ${guildId}:`, error);
    }
}

/**
 * Main creator alerts processing function
 */
async function processCreatorAlerts(client) {
    console.log('[CREATOR-ALERTS] Starting creator alerts processing...');
    
    // Initialize cache on first run
    if (!global.creatorAlertCacheInitialized) {
        await initializeCache();
        global.creatorAlertCacheInitialized = true;
    }
    
    try {
        // Get all enabled creator alert rules
        const [rules] = await appDb.query(`
            SELECT 
                car.id,
                car.guild_id,
                car.platform,
                car.creator,
                car.role_id,
                car.channel_id,
                car.discord_user_id,
                car.notes,
                car.enabled
            FROM creator_alert_rules car
            WHERE car.enabled = 1
        `);
        
        if (rules.length === 0) {
            console.log('[CREATOR-ALERTS] No enabled creator alert rules found');
            return;
        }
        
        // Group rules by platform for better logging
        const platformCounts = rules.reduce((acc, rule) => {
            acc[rule.platform] = (acc[rule.platform] || 0) + 1;
            return acc;
        }, {});
        
        console.log(`[CREATOR-ALERTS] Processing ${rules.length} enabled creator alert rules:`, platformCounts);
        
        // Clean up cache for deleted rules (remove cache entries that no longer have rules)
        if (global.creatorAlertCache) {
            const currentRuleIds = rules.map(r => r.id);
            const cacheKeysToRemove = [];
            
            Object.keys(global.creatorAlertCache).forEach(cacheKey => {
                // Extract guild ID from cache key
                const parts = cacheKey.split('_');
                if (parts.length >= 3) {
                    const guildId = parts[2];
                    // Check if this cache entry is for a guild we're currently processing
                    const hasActiveRules = rules.some(r => r.guild_id === guildId);
                    if (!hasActiveRules) {
                        cacheKeysToRemove.push(cacheKey);
                    }
                }
            });
            
            // Remove orphaned cache entries
            cacheKeysToRemove.forEach(key => {
                delete global.creatorAlertCache[key];
                console.log(`[CREATOR-ALERTS] Removed orphaned cache entry: ${key}`);
            });
        }
        
        // Process each rule
        for (const rule of rules) {
            try {
                console.log(`[CREATOR-ALERTS] Processing rule ${rule.id} for creator ${rule.creator} in guild ${rule.guild_id}`);
                
                let isLive = false;
                let streamData = null;
                let notificationSent = false;

                if (rule.platform === 'twitch') {
                    const twitchUserId = await getTwitchUserId(rule.creator);
                    if (!twitchUserId) {
                        console.log(`[CREATOR-ALERTS] Could not find Twitch user ID for ${rule.creator}`);
                        continue;
                    }
                    streamData = await isTwitchUserLive(twitchUserId);
                    isLive = streamData !== null;
                } else if (rule.platform === 'youtube') {
                    const youtubeChannelId = await getYouTubeChannelId(rule.creator);
                    if (!youtubeChannelId) {
                        console.log(`[CREATOR-ALERTS] Could not find YouTube channel ID for ${rule.creator}`);
                        continue;
                    }
                    streamData = await isYouTubeChannelLive(youtubeChannelId);
                    isLive = streamData !== null;
                } else if (rule.platform === 'kick') {
                    streamData = await isKickChannelLive(rule.creator);
                    isLive = streamData !== null;
                } else if (rule.platform === 'tiktok') {
                    streamData = await isTikTokUserLive(rule.creator);
                    isLive = streamData !== null;
                }
                
                // Check if we've already processed this user's status
                const cacheKey = `creator_alert_${rule.guild_id}_${rule.creator}`; // Use creator as part of cache key
                const lastStatus = global.creatorAlertCache?.[cacheKey];
                
                console.log(`[CREATOR-ALERTS] Stream data for ${rule.creator}:`, isLive ? 'LIVE' : 'OFFLINE');
                console.log(`[CREATOR-ALERTS] Last status from cache:`, lastStatus);
                
                const now = Date.now();
                if (isLive && !lastStatus?.live) {
                    console.log(`[CREATOR-ALERTS] ${rule.creator} went live on ${rule.platform} in guild ${rule.guild_id}`);
                    
                    // Assign Discord role if specified
                    if (rule.role_id) {
                        await assignDiscordRole(client, rule.guild_id, rule.discord_user_id, rule.role_id, rule.platform);
                    }
                    
                    // Send notification
                    if (rule.platform === 'twitch') {
                        await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id, 'twitch');
                    } else if (rule.platform === 'youtube') {
                        await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id, 'youtube');
                    } else if (rule.platform === 'kick') {
                        await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id, 'kick');
                    } else if (rule.platform === 'tiktok') {
                        await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id, 'tiktok');
                    }
                    
                    // Update cache
                    global.creatorAlertCache[cacheKey] = { live: true, timestamp: now };
                } else if (!isLive && lastStatus?.live) {
                    console.log(`[CREATOR-ALERTS] ${rule.creator} went offline on ${rule.platform} in guild ${rule.guild_id}`);
                    
                    // Remove Discord role if specified
                    if (rule.role_id) {
                        await removeDiscordRole(client, rule.guild_id, rule.discord_user_id, rule.role_id, rule.platform);
                    }
                    
                    // Update cache
                    global.creatorAlertCache[cacheKey] = { live: false, timestamp: now };
                }
                
                // Clean up old cache entries (older than 24 hours)
                if (global.creatorAlertCache) {
                    const now = Date.now();
                    Object.keys(global.creatorAlertCache).forEach(key => {
                        if (now - global.creatorAlertCache[key].timestamp > 86400000) { // 24 hours
                            delete global.creatorAlertCache[key];
                        }
                    });
                }
                
            } catch (ruleError) {
                console.error(`[CREATOR-ALERTS] Error processing rule ${rule.id}:`, ruleError);
                continue; // Continue with next rule
            }
        }
        
        console.log('[CREATOR-ALERTS] Creator alerts processing completed');
        
    } catch (error) {
        console.error('[CREATOR-ALERTS] Error during creator alerts processing:', error);
        throw error;
    }
}

/**
 * Get YouTube channel information
 */
async function getYouTubeChannelInfo(channelId) {
    try {
        const response = await fetch(
            `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${YOUTUBE_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error(`Failed to get YouTube channel info: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const channel = data.items[0];
            return {
                id: channel.id,
                title: channel.snippet.title,
                description: channel.snippet.description,
                customUrl: channel.snippet.customUrl,
                publishedAt: channel.snippet.publishedAt,
                thumbnails: channel.snippet.thumbnails,
                country: channel.snippet.country,
                language: channel.snippet.defaultLanguage,
                subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
                viewCount: parseInt(channel.statistics.viewCount) || 0,
                videoCount: parseInt(channel.statistics.videoCount) || 0,
                hiddenSubscriberCount: channel.statistics.hiddenSubscriberCount,
                banner: channel.brandingSettings?.image?.bannerExternalUrl,
                keywords: channel.brandingSettings?.channel?.keywords
            };
        }
        return null;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting YouTube channel info for ${channelId}:`, error);
        return null;
    }
}

/**
 * Get YouTube channel ID from username or channel URL
 */
async function getYouTubeChannelId(username) {
    try {
        // Try to get channel by username first
        const response = await fetch(
            `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(username)}&type=channel&maxResults=1&key=${YOUTUBE_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error(`Failed to search YouTube channels: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].id.channelId;
        }
        
        return null;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting YouTube channel ID for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a YouTube channel is currently live
 */
async function isYouTubeChannelLive(channelId) {
    try {
        const token = await getYouTubeToken();
        
        // First, get channel info and search for live streams
        const searchResponse = await fetch(
            `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`
        );
        
        if (!searchResponse.ok) {
            throw new Error(`Failed to search YouTube streams: ${searchResponse.status} ${searchResponse.statusText}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (searchData.items && searchData.items.length > 0) {
            const liveVideo = searchData.items[0];
            const videoId = liveVideo.id.videoId;
            
            // Get detailed video information including statistics
            const videoResponse = await fetch(
                `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
            );
            if (videoResponse.ok) {
                const videoData = await videoResponse.json();
                if (videoData.items && videoData.items.length > 0) {
                    const video = videoData.items[0];
                    
                    // Get category name
                    let categoryName = 'Unknown';
                    if (video.snippet.categoryId) {
                        try {
                            const categoryResponse = await fetch(
                                `${YOUTUBE_API_BASE}/videoCategories?part=snippet&id=${video.snippet.categoryId}&key=${YOUTUBE_API_KEY}`
                            );
                            if (categoryResponse.ok) {
                                const categoryData = await categoryResponse.json();
                                if (categoryData.items && categoryData.items.length > 0) {
                                    categoryName = categoryData.items[0].snippet.title;
                                }
                            }
                        } catch (categoryError) {
                            console.error('[CREATOR-ALERTS] Error fetching category:', categoryError);
                        }
                    }
                    
                    // Return enriched stream data
                    return {
                        id: videoId,
                        title: video.snippet.title,
                        description: video.snippet.description,
                        category: categoryName,
                        categoryId: video.snippet.categoryId,
                        thumbnails: video.snippet.thumbnails,
                        tags: video.snippet.tags || [],
                        language: video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage || 'Unknown',
                        publishedAt: video.snippet.publishedAt,
                        channelTitle: video.snippet.channelTitle,
                        channelId: video.snippet.channelId,
                        viewerCount: parseInt(video.statistics.viewCount) || 0,
                        likeCount: parseInt(video.statistics.likeCount) || 0,
                        commentCount: parseInt(video.statistics.commentCount) || 0,
                        duration: video.contentDetails.duration,
                        liveBroadcastContent: video.snippet.liveBroadcastContent,
                        isLive: video.snippet.liveBroadcastContent === 'live'
                    };
                }
            }
        }
        
        return null; // Not live
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error checking YouTube stream for channel ${channelId}:`, error);
        return null;
    }
}

/**
 * Get Kick channel info from username
 */
async function getKickChannelInfo(username) {
    try {
        const response = await fetch(`${KICK_API_BASE}/channels/${encodeURIComponent(username)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // Channel not found
            }
            throw new Error(`Failed to get Kick channel: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.id,
            username: data.user.username,
            displayName: data.user.displayname,
            isLive: data.livestream && data.livestream.is_live,
            streamTitle: data.livestream?.session_title || null,
            viewerCount: data.livestream?.viewer_count || 0
        };
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting Kick channel info for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a Kick channel is currently live
 */
async function isKickChannelLive(username) {
    try {
        const channelInfo = await getKickChannelInfo(username);
        if (channelInfo && channelInfo.isLive) {
            // Return enriched stream data
            return {
                id: channelInfo.id,
                title: channelInfo.streamTitle || 'Live Stream',
                description: `Live stream by ${channelInfo.displayName}`,
                category: 'Gaming', // Kick is primarily gaming-focused
                thumbnails: {
                    high: { url: null }, // Kick doesn't provide thumbnails in public API
                    medium: { url: null },
                    default: { url: null }
                },
                tags: [],
                language: 'Unknown',
                publishedAt: new Date().toISOString(),
                channelTitle: channelInfo.displayName,
                channelId: channelInfo.id,
                viewerCount: channelInfo.viewerCount || 0,
                likeCount: 0, // Not available in Kick public API
                commentCount: 0, // Not available in Kick public API
                duration: null,
                liveBroadcastContent: 'live',
                isLive: true
            };
        }
        return null; // Not live
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error checking Kick live status for ${username}:`, error);
        return null;
    }
}

/**
 * Get TikTok user info from username
 */
async function getTikTokUserInfo(username) {
    try {
        // TikTok's public API is limited, so we'll use a basic approach
        // In production, you might want to use a third-party service or TikTok's official API
        const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // User not found
            }
            throw new Error(`Failed to get TikTok user: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Basic parsing - in production you'd want more robust parsing
        // This is a simplified approach for demonstration
        const isLive = html.includes('"isLive":true') || html.includes('"liveStreaming":true');
        
        return {
            username: username,
            isLive: isLive,
            // Note: TikTok's public page doesn't provide much live stream info
            // You might need to use their official API or a third-party service
        };
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting TikTok user info for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a TikTok user is currently live
 */
async function isTikTokUserLive(username) {
    try {
        const userInfo = await getTikTokUserInfo(username);
        if (userInfo && userInfo.isLive) {
            // Return enriched stream data (limited due to TikTok API restrictions)
            return {
                id: `tiktok_${username}_${Date.now()}`,
                title: 'Live Stream',
                description: `Live stream by @${username}`,
                category: 'Entertainment',
                thumbnails: {
                    high: { url: null }, // Not available in TikTok public API
                    medium: { url: null },
                    default: { url: null }
                },
                tags: [],
                language: 'Unknown',
                publishedAt: new Date().toISOString(),
                channelTitle: username,
                channelId: username,
                viewerCount: 0, // Not available in TikTok public API
                likeCount: 0,
                commentCount: 0,
                duration: null,
                liveBroadcastContent: 'live',
                isLive: true
            };
        }
        return null; // Not live
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error checking TikTok live status for ${username}:`, error);
        return null;
    }
}

module.exports = { processCreatorAlerts, clearAllCache, clearGuildCache };