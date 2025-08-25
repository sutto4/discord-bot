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
 * Test YouTube API key functionality
 */
async function testYouTubeAPI() {
    try {
        console.log('[CREATOR-ALERTS] Testing YouTube API key...');
        console.log(`[CREATOR-ALERTS] API Key (first 10 chars): ${YOUTUBE_API_KEY ? YOUTUBE_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
        
        // Test 1: Simple search (most basic API call)
        console.log('[CREATOR-ALERTS] Test 1: Basic search API call...');
        const testResponse = await fetch(
            `${YOUTUBE_API_BASE}/search?part=snippet&q=test&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`
        );
        
        console.log(`[CREATOR-ALERTS] Test 1 Response Status: ${testResponse.status} ${testResponse.statusText}`);
        
        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('[CREATOR-ALERTS] YouTube API test successful:', testData.items ? testData.items.length : 0, 'results');
            
            // Test 2: Check if we can get channel info
            console.log('[CREATOR-ALERTS] Test 2: Channel info API call...');
            const channelResponse = await fetch(
                `${YOUTUBE_API_BASE}/channels?part=snippet&id=UC_x5XG1OV2P6uZZ5FSM9Ttw&key=${YOUTUBE_API_KEY}`
            );
            
            console.log(`[CREATOR-ALERTS] Test 2 Response Status: ${channelResponse.status} ${channelResponse.statusText}`);
            
            if (channelResponse.ok) {
                console.log('[CREATOR-ALERTS] YouTube API fully functional!');
                return true;
            } else {
                console.error(`[CREATOR-ALERTS] Channel API failed: ${channelResponse.status} ${channelResponse.statusText}`);
                const errorText = await channelResponse.text();
                console.error(`[CREATOR-ALERTS] Error details: ${errorText}`);
                return false;
            }
        } else {
            console.error(`[CREATOR-ALERTS] YouTube API test failed: ${testResponse.status} ${testResponse.statusText}`);
            const errorText = await testResponse.text();
            console.error(`[CREATOR-ALERTS] Error details: ${errorText}`);
            
            // Check for specific error types
            if (testResponse.status === 403) {
                console.error('[CREATOR-ALERTS] 403 Forbidden - Check API key restrictions and YouTube Data API v3 enablement');
            } else if (testResponse.status === 400) {
                console.error('[CREATOR-ALERTS] 400 Bad Request - Check API key format and parameters');
            } else if (testResponse.status === 429) {
                console.error('[CREATOR-ALERTS] 429 Too Many Requests - API quota exceeded');
            }
            
            return false;
        }
    } catch (error) {
        console.error('[CREATOR-ALERTS] YouTube API test error:', error);
        return false;
    }
}

/**
 * Get YouTube API key
 */
async function getYouTubeToken() {
    if (!youtubeApiKey) {
        throw new Error('[CREATOR-ALERTS] YouTube API key not configured');
    }
    
    // Test the API key on first use
    if (!global.youtubeApiTested) {
        const apiWorking = await testYouTubeAPI();
        if (!apiWorking) {
            console.error('[CREATOR-ALERTS] YouTube API key test failed - check your configuration');
        }
        global.youtubeApiTested = true;
    }
    
    return youtubeApiKey;
}

// Kick API configuration (using their public API)
const KICK_API_BASE = 'https://kick.com/api/v1';

// TikTok API configuration (using their public API)
const TIKTOK_API_BASE = 'https://www.tiktok.com/api';

const POLL_INTERVAL = parseInt(process.env.CREATOR_ALERTS_POLL_SECONDS || '300') * 1000; // Default 5 minutes (was 60 seconds)
// NOTE: YouTube API has a daily quota of 10,000 queries
// Each creator check uses 4+ API calls, so with 60-second polling, you'll hit the limit quickly
// Consider increasing CREATOR_ALERTS_POLL_SECONDS to 300 (5 min) or 600 (10 min) to reduce usage

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

// Twitch user ID cache to prevent repeated API calls
const twitchUserIdCache = new Map();
const TWITCH_USER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get Twitch user ID from username - OPTIMIZED VERSION
 * Uses caching to prevent repeated API calls
 */
async function getTwitchUserId(username) {
    try {
        // Check cache first
        const cacheKey = username.toLowerCase();
        const cached = twitchUserIdCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < TWITCH_USER_CACHE_TTL) {
            console.log(`[CREATOR-ALERTS] Using cached Twitch user ID: ${cached.userId} for ${username}`);
            return cached.userId;
        }
        
        // Check quota before making API call
        if (!checkTwitchQuota()) {
            console.warn(`[CREATOR-ALERTS] Twitch API quota limit reached, skipping user lookup for ${username}`);
            return null;
        }
        
        console.log(`[CREATOR-ALERTS] Looking up Twitch user ID for: ${username}`);
        const token = await getTwitchToken();
        
        const response = await fetch(`${TWITCH_API_BASE}/users?login=${encodeURIComponent(username)}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        incrementTwitchQuota(); // Count this API call
        
        if (!response.ok) {
            throw new Error(`Failed to get Twitch user: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const userId = data.data[0]?.id || null;
        
        if (userId) {
            // Cache the result
            twitchUserIdCache.set(cacheKey, {
                userId: userId,
                timestamp: Date.now()
            });
            console.log(`[CREATOR-ALERTS] Cached Twitch user ID: ${userId} for ${username}`);
        }
        
        return userId;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting Twitch user ID for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a Twitch user is currently live - OPTIMIZED VERSION
 */
async function isTwitchUserLive(userId) {
    try {
        // Check quota before making API call
        if (!checkTwitchQuota()) {
            console.warn(`[CREATOR-ALERTS] Twitch API quota limit reached, skipping live check for ${userId}`);
            return null;
        }
        
        const token = await getTwitchToken();
        
        const response = await fetch(`${TWITCH_API_BASE}/streams?user_id=${userId}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        incrementTwitchQuota(); // Count this API call
        
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
                text: `ServerMate Creator Alerts • ${platform.charAt(0).toUpperCase() + platform.slice(1)}${platform === 'youtube' ? ' • Live data may be delayed' : ''}`
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
                    value: `${streamData.viewerCount.toLocaleString()}${streamData.isLive ? ' (Live)' : ' (Total Views)'}`,
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
                    value: `${streamData.viewer_count.toLocaleString()}${streamData.isLive ? ' (Live)' : ' (Total Views)'}`,
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
                    value: `${streamData.viewerCount.toLocaleString()}${streamData.isLive ? ' (Live)' : ' (Total Views)'}`,
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
                    console.log(`[CREATOR-ALERTS] Processing YouTube rule for creator: ${rule.creator}`);
                    const youtubeChannelId = await getYouTubeChannelId(rule.creator);
                    if (!youtubeChannelId) {
                        console.log(`[CREATOR-ALERTS] Could not find YouTube channel ID for ${rule.creator}`);
                        continue;
                    }
                    console.log(`[CREATOR-ALERTS] Got YouTube channel ID: ${youtubeChannelId}, checking if live...`);
                    streamData = await isYouTubeChannelLive(youtubeChannelId);
                    isLive = streamData !== null;
                    console.log(`[CREATOR-ALERTS] YouTube live check result: isLive=${isLive}, streamData=${streamData ? 'Present' : 'None'}`);
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

// YouTube channel ID cache to prevent repeated API calls
const channelIdCache = new Map();
const CHANNEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get YouTube channel ID from username or channel URL - OPTIMIZED VERSION
 * Uses caching and optimized API calls
 */
async function getYouTubeChannelId(username) {
    try {
        console.log(`[CREATOR-ALERTS] Looking up YouTube channel ID for: ${username}`);
        
        // Check cache first
        const cacheKey = username.toLowerCase();
        const cached = channelIdCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CHANNEL_CACHE_TTL) {
            console.log(`[CREATOR-ALERTS] Using cached channel ID: ${cached.channelId} for ${username}`);
            return cached.channelId;
        }
        
        // Check quota before making API call
        if (!checkYouTubeQuota()) {
            console.warn(`[CREATOR-ALERTS] YouTube API quota limit reached, skipping channel lookup for ${username}`);
            return null;
        }
        
        // Clean the username (remove @ if present)
        const cleanUsername = username.replace(/^@/, '');
        console.log(`[CREATOR-ALERTS] Cleaned username: ${cleanUsername}`);
        
        // OPTIMIZED: Single API call to search for channels
        // This gets channel info in one request instead of multiple
        const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(cleanUsername)}&type=channel&maxResults=5&key=${YOUTUBE_API_KEY}`;
        console.log(`[CREATOR-ALERTS] Optimized channel search URL: ${searchUrl}`);
        
        const response = await fetch(searchUrl);
        incrementYouTubeQuota(); // Count this single API call
        
        if (!response.ok) {
            throw new Error(`Failed to search YouTube channels: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`[CREATOR-ALERTS] YouTube channel search response:`, JSON.stringify(data, null, 2));
        
        if (data.items && data.items.length > 0) {
            // Look for exact matches first
            const exactMatch = data.items.find(item => 
                item.snippet.title.toLowerCase() === cleanUsername.toLowerCase() ||
                item.snippet.title.toLowerCase().includes(cleanUsername.toLowerCase()) ||
                item.snippet.customUrl === cleanUsername
            );
            
            let channelId;
            if (exactMatch) {
                channelId = exactMatch.id.channelId;
                console.log(`[CREATOR-ALERTS] Found exact YouTube channel match: ${channelId} for ${cleanUsername}`);
            } else {
                // Fallback to first result
                channelId = data.items[0].id.channelId;
                console.log(`[CREATOR-ALERTS] Using first search result: ${channelId} for ${cleanUsername}`);
            }
            
            // Cache the result
            channelIdCache.set(cacheKey, {
                channelId: channelId,
                timestamp: Date.now()
            });
            
            return channelId;
        }
        
        console.log(`[CREATOR-ALERTS] No YouTube channel found for: ${cleanUsername}`);
        return null;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error getting YouTube channel ID for ${username}:`, error);
        return null;
    }
}

/**
 * Check if a YouTube channel is currently live - OPTIMIZED VERSION
 * Uses a single API call to get all needed data
 */
async function isYouTubeChannelLive(channelId) {
    try {
        console.log(`[CREATOR-ALERTS] Checking if YouTube channel ${channelId} is live (optimized)...`);
        
        // Check quota before making API call
        if (!checkYouTubeQuota()) {
            console.warn(`[CREATOR-ALERTS] YouTube API quota limit reached, skipping live check for ${channelId}`);
            return null;
        }
        
        // SINGLE API CALL: Get live streams with all the data we need
        // This gets: video info, statistics, content details, and snippet data in one request
        const optimizedUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&eventType=live&maxResults=1&key=${YOUTUBE_API_KEY}`;
        console.log(`[CREATOR-ALERTS] Optimized YouTube API call: ${optimizedUrl}`);
        
        const response = await fetch(optimizedUrl);
        incrementYouTubeQuota(); // Count this single API call
        
        if (!response.ok) {
            throw new Error(`Failed to search YouTube streams: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`[CREATOR-ALERTS] YouTube optimized response:`, JSON.stringify(data, null, 2));
        
        if (data.items && data.items.length > 0) {
            const liveVideo = data.items[0];
            const videoId = liveVideo.id.videoId;
            console.log(`[CREATOR-ALERTS] Found live video ID: ${videoId}`);
            
            // Get additional details in a SECOND API call (only if we found a live stream)
            // This gets: statistics, content details, and more detailed snippet data
            const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
            const detailsResponse = await fetch(detailsUrl);
            incrementYouTubeQuota(); // Count this second API call
            
            if (detailsResponse.ok) {
                const detailsData = await detailsResponse.json();
                if (detailsData.items && detailsData.items.length > 0) {
                    const video = detailsData.items[0];
                    
                    // Verify it's actually live
                    if (video.snippet.liveBroadcastContent !== 'live') {
                        console.log(`[CREATOR-ALERTS] Video ${videoId} is not live (liveBroadcastContent: ${video.snippet.liveBroadcastContent})`);
                        return null;
                    }
                    
                    // Get category name from the video data (no additional API call needed)
                    let categoryName = 'Unknown';
                    if (video.snippet.categoryId) {
                        // Instead of making a separate API call, we'll use a category mapping
                        // This saves 1 API call per creator check!
                        categoryName = getCategoryNameFromId(video.snippet.categoryId);
                    }
                    
                    // Return enriched stream data from our 2 API calls
                    const streamData = {
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
                        viewerCount: parseInt(video.statistics.viewCount) || 0, // Use viewCount for now
                        likeCount: parseInt(video.statistics.likeCount) || 0,
                        commentCount: parseInt(video.statistics.commentCount) || 0,
                        duration: video.contentDetails.duration,
                        liveBroadcastContent: video.snippet.liveBroadcastContent,
                        isLive: video.snippet.liveBroadcastContent === 'live'
                    };
                    
                    console.log(`[CREATOR-ALERTS] YouTube optimized stream data:`, JSON.stringify(streamData, null, 2));
                    return streamData;
                }
            }
        } else {
            console.log(`[CREATOR-ALERTS] No live streams found for channel ${channelId}`);
        }
        
        console.log(`[CREATOR-ALERTS] Channel ${channelId} is not live`);
        return null; // Not live
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error checking YouTube stream for channel ${channelId}:`, error);
        return null;
    }
}

/**
 * Get category name from category ID without making an API call
 * This saves 1 API call per creator check!
 */
function getCategoryNameFromId(categoryId) {
    // YouTube's most common video categories
    const categoryMap = {
        '1': 'Film & Animation',
        '2': 'Autos & Vehicles', 
        '10': 'Music',
        '15': 'Pets & Animals',
        '17': 'Sports',
        '19': 'Travel & Events',
        '20': 'Gaming',
        '22': 'People & Blogs',
        '23': 'Comedy',
        '24': 'Entertainment',
        '25': 'News & Politics',
        '26': 'Howto & Style',
        '27': 'Education',
        '28': 'Science & Technology',
        '29': 'Nonprofits & Activism'
    };
    
    return categoryMap[categoryId] || 'Unknown';
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

// YouTube API quota monitoring
let dailyApiCalls = 0;
const MAX_DAILY_CALLS = 9500; // Leave 500 buffer
const QUOTA_RESET_HOUR = 0; // Reset at midnight UTC

/**
 * Reset all API quota counters at midnight UTC
 */
function resetQuotaCounters() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    // Reset counters at midnight UTC
    if (currentHour === 0) {
        if (dailyApiCalls > 0) {
            console.log(`[CREATOR-ALERTS] Resetting YouTube API daily call counter (was ${dailyApiCalls})`);
            dailyApiCalls = 0;
        }
        if (twitchDailyApiCalls > 0) {
            console.log(`[CREATOR-ALERTS] Resetting Twitch API daily call counter (was ${twitchDailyApiCalls})`);
            twitchDailyApiCalls = 0;
        }
    }
}

/**
 * Check if we're approaching the API quota limit
 */
function checkYouTubeQuota() {
    resetQuotaCounters(); // Check for reset opportunity
    
    if (dailyApiCalls >= MAX_DAILY_CALLS) {
        console.warn(`[CREATOR-ALERTS] YouTube API daily quota limit approaching! Used: ${dailyApiCalls}/${MAX_DAILY_CALLS}`);
        return false;
    }
    
    return true;
}

/**
 * Increment API call counter
 */
function incrementYouTubeQuota() {
    dailyApiCalls++;
    if (dailyApiCalls % 100 === 0) {
        console.log(`[CREATOR-ALERTS] YouTube API calls today: ${dailyApiCalls}/${MAX_DAILY_CALLS}`);
    }
}

// Twitch API quota monitoring
let twitchDailyApiCalls = 0;
const MAX_TWITCH_DAILY_CALLS = 1000; // Twitch has higher limits, but let's be conservative

/**
 * Check if we're approaching the Twitch API quota limit
 */
function checkTwitchQuota() {
    resetQuotaCounters(); // Check for reset opportunity
    
    if (twitchDailyApiCalls >= MAX_TWITCH_DAILY_CALLS) {
        console.warn(`[CREATOR-ALERTS] Twitch API daily quota limit approaching! Used: ${twitchDailyApiCalls}/${MAX_TWITCH_DAILY_CALLS}`);
        return false;
    }
    return true;
}

/**
 * Increment Twitch API call counter
 */
function incrementTwitchQuota() {
    twitchDailyApiCalls++;
    if (twitchDailyApiCalls % 100 === 0) {
        console.log(`[CREATOR-ALERTS] Twitch API calls today: ${twitchDailyApiCalls}/${MAX_TWITCH_DAILY_CALLS}`);
    }
}

module.exports = { processCreatorAlerts, clearAllCache, clearGuildCache };