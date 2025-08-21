const { appDb } = require('../config/database');
const fetch = require('node-fetch');

// Twitch API configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_TOKEN_URL = process.env.TWITCH_TOKEN_URL || 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_BASE = process.env.TWITCH_API_BASE || 'https://api.twitch.tv/helix';
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
        console.log('[CREATOR-ALERTS] Refreshing Twitch access token...');
        
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
        
        console.log('[CREATOR-ALERTS] Twitch token refreshed successfully');
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
async function assignDiscordRole(client, guildId, userId, roleId) {
    try {
        console.log(`[CREATOR-ALERTS] DEBUG: Attempting to assign role ${roleId} to user ${userId} in guild ${guildId}`);
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found`);
            return false;
        }
        console.log(`[CREATOR-ALERTS] DEBUG: Found guild: ${guild.name}`);
        
        // Check if bot has MANAGE_ROLES permission
        if (!guild.members.me.permissions.has('ManageRoles')) {
            console.error(`[CREATOR-ALERTS] Bot does not have MANAGE_ROLES permission in guild ${guild.name}`);
            return false;
        }
        console.log(`[CREATOR-ALERTS] DEBUG: Bot has MANAGE_ROLES permission`);
        
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
        
        await member.roles.add(roleId, 'Creator Alert: User went live on Twitch');
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
async function removeDiscordRole(client, guildId, userId, roleId) {
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
        
        await member.roles.remove(roleId, 'Creator Alert: User went offline on Twitch');
        console.log(`[CREATOR-ALERTS] Removed role ${roleId} from user ${userId} in guild ${guild.name}`);
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
 * Send Discord notification about creator going live
 */
async function sendLiveNotification(client, guildId, channelId, creatorName, streamData, discordUserId = null) {
    try {
        console.log(`[CREATOR-ALERTS] DEBUG: Attempting to send notification for ${creatorName} in guild ${guildId}, channel ${channelId}`);
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`[CREATOR-ALERTS] Guild ${guildId} not found for notification`);
            return false;
        }
        console.log(`[CREATOR-ALERTS] DEBUG: Found guild: ${guild.name}`);
        
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            console.error(`[CREATOR-ALERTS] Channel ${channelId} not found in guild ${guildId}`);
            return false;
        }
        console.log(`[CREATOR-ALERTS] DEBUG: Found channel: #${channel.name}`);
        
        // Get Twitch user's profile picture
        let twitchProfilePicUrl = null;
        try {
            const token = await getTwitchToken();
            const response = await fetch(`${TWITCH_API_BASE}/users?login=${encodeURIComponent(creatorName)}`, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                if (userData.data && userData.data[0] && userData.data[0].profile_image_url) {
                    twitchProfilePicUrl = userData.data[0].profile_image_url;
                }
            }
        } catch (error) {
            console.log(`[CREATOR-ALERTS] Could not fetch Twitch profile picture for ${creatorName}:`, error.message);
        }
        
        // Process Twitch stream thumbnail
        let streamThumbnailUrl = null;
        if (streamData.thumbnail_url) {
            // Replace placeholder dimensions with actual dimensions
            streamThumbnailUrl = streamData.thumbnail_url
                .replace('{width}', '1280')
                .replace('{height}', '720');
        }
        
        const embed = {
            color: 0x9146FF, // Twitch purple
            title: `🎮 ${creatorName} is now LIVE on Twitch!`,
            description: streamData.title || 'No title available',
            fields: [
                {
                    name: 'Game',
                    value: streamData.game_name || 'Unknown game',
                    inline: true
                },
                {
                    name: 'Viewers',
                    value: streamData.viewer_count?.toString() || '0',
                    inline: true
                }
            ],
            thumbnail: {
                url: twitchProfilePicUrl || null // Twitch user's profile picture
            },
            image: {
                url: streamThumbnailUrl || null // Twitch stream screenshot
            },
            url: `https://twitch.tv/${creatorName}`,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Creator Alerts • ServerHub'
            }
        };
        
        await channel.send({
            content: `**${creatorName}** just went live on Twitch!`,
            embeds: [embed]
        });
        
        console.log(`[CREATOR-ALERTS] Sent live notification for ${creatorName} in guild ${guild.name}`);
        return true;
    } catch (error) {
        console.error(`[CREATOR-ALERTS] Error sending live notification for ${creatorName} in guild ${guildId}:`, error);
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
                text: 'Creator Alerts • ServerHub'
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
            WHERE car.enabled = 1 AND car.platform = 'twitch'
        `);
        
        if (rules.length === 0) {
            console.log('[CREATOR-ALERTS] No enabled Twitch creator alert rules found');
            return;
        }
        
        console.log(`[CREATOR-ALERTS] Processing ${rules.length} enabled Twitch creator alert rules`);
        
        // Process each rule
        for (const rule of rules) {
            try {
                console.log(`[CREATOR-ALERTS] Processing rule ${rule.id} for creator ${rule.creator} in guild ${rule.guild_id}`);
                
                // Get Twitch user ID for the creator
                const twitchUserId = await getTwitchUserId(rule.creator);
                if (!twitchUserId) {
                    console.error(`[CREATOR-ALERTS] Could not get Twitch user ID for ${rule.creator}`);
                    continue;
                }
                
                // Check if user is currently live
                const streamData = await isTwitchUserLive(twitchUserId);
                
                // Check if we've already processed this user's status
                const cacheKey = `creator_alert_${rule.guild_id}_${twitchUserId}`;
                const lastStatus = global.creatorAlertCache?.[cacheKey];
                
                console.log(`[CREATOR-ALERTS] Stream data for ${rule.creator}:`, streamData ? 'LIVE' : 'OFFLINE');
                console.log(`[CREATOR-ALERTS] Last status from cache:`, lastStatus);
                
                // DEBUG: Force test notification every time for testing
                if (streamData) {
                    console.log(`[CREATOR-ALERTS] DEBUG: Forcing test notification for ${rule.creator}`);
                    
                    // Assign role if Discord user is mapped
                    if (rule.discord_user_id) {
                        try {
                            await assignDiscordRole(client, rule.guild_id, rule.discord_user_id, rule.role_id);
                            console.log(`[CREATOR-ALERTS] Role assigned to Discord user ${rule.discord_user_id} for ${rule.creator}`);
                        } catch (roleError) {
                            console.error(`[CREATOR-ALERTS] Failed to assign role for ${rule.creator}:`, roleError);
                        }
                    } else {
                        console.log(`[CREATOR-ALERTS] No Discord user mapped for ${rule.creator} - skipping role assignment`);
                    }
                    
                    // Send notification
                    await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id);
                    
                    // Update cache
                    if (!global.creatorAlertCache) global.creatorAlertCache = {};
                    const cacheData = { 
                        live: true, 
                        timestamp: Date.now(),
                        streamStartedAt: streamData.started_at,
                        streamId: streamData.id,
                        lastNotificationSent: Date.now()
                    };
                    global.creatorAlertCache[cacheKey] = cacheData;
                    
                    // Persist to database
                    await updateCacheInDb(cacheKey, cacheData);
                    
                    console.log(`[CREATOR-ALERTS] DEBUG: Test notification sent for ${rule.creator}`);
                    continue; // Skip the normal logic for now
                }
                
                if (streamData && !lastStatus?.live) {
                    // Creator just went live
                    console.log(`[CREATOR-ALERTS] ${rule.creator} just went live on Twitch in guild ${rule.guild_id}`);
                    
                    // Assign role if Discord user is mapped
                    if (rule.discord_user_id) {
                        try {
                            await assignDiscordRole(client, rule.guild_id, rule.discord_user_id, rule.role_id);
                            console.log(`[CREATOR-ALERTS] Role assigned to Discord user ${rule.discord_user_id} for ${rule.creator}`);
                        } catch (roleError) {
                            console.error(`[CREATOR-ALERTS] Failed to assign role for ${rule.creator}:`, roleError);
                        }
                    } else {
                        console.log(`[CREATOR-ALERTS] No Discord user mapped for ${rule.creator} - skipping role assignment`);
                    }
                    
                    // Send notification
                    await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id);
                    
                    // Update cache with stream start time and stream ID for better tracking
                    if (!global.creatorAlertCache) global.creatorAlertCache = {};
                    const cacheData = { 
                        live: true, 
                        timestamp: Date.now(),
                        streamStartedAt: streamData.started_at,
                        streamId: streamData.id,
                        lastNotificationSent: Date.now()
                    };
                    global.creatorAlertCache[cacheKey] = cacheData;
                    
                    // Persist to database
                    await updateCacheInDb(cacheKey, cacheData);
                    
                } else if (!streamData && lastStatus?.live) {
                    // Creator just went offline
                    console.log(`[CREATOR-ALERTS] ${rule.creator} just went offline on Twitch in guild ${rule.guild_id}`);
                    
                    // Remove role if Discord user is mapped
                    if (rule.discord_user_id) {
                        try {
                            await removeDiscordRole(client, rule.guild_id, rule.discord_user_id, rule.role_id);
                            console.log(`[CREATOR-ALERTS] Role removed from Discord user ${rule.discord_user_id} for ${rule.creator}`);
                        } catch (roleError) {
                            console.error(`[CREATOR-ALERTS] Failed to remove role for ${rule.creator}:`, roleError);
                        }
                    } else {
                        console.log(`[CREATOR-ALERTS] No Discord user mapped for ${rule.creator} - skipping role removal`);
                    }
                    
                    // Send offline notification
                    await sendOfflineNotification(client, rule.guild_id, rule.channel_id, rule.creator);
                    
                    // Update cache
                    if (!global.creatorAlertCache) global.creatorAlertCache = {};
                    const cacheData = { 
                        live: false, 
                        timestamp: Date.now(),
                        streamStartedAt: null,
                        streamId: null,
                        lastNotificationSent: Date.now()
                    };
                    global.creatorAlertCache[cacheKey] = cacheData;
                    
                    // Persist to database
                    await updateCacheInDb(cacheKey, cacheData);
                } else if (streamData && lastStatus?.live) {
                    // Creator is still live - check if we need to update cache
                    const currentStreamId = streamData.id;
                    const lastStreamId = lastStatus.streamId;
                    
                    // If it's a different stream (stream ended and new one started), treat it as new
                    if (lastStreamId && currentStreamId !== lastStreamId) {
                        console.log(`[CREATOR-ALERTS] ${rule.creator} started a new stream on Twitch in guild ${rule.guild_id} (previous stream ended)`);
                        
                        // Send notification for new stream
                        await sendLiveNotification(client, rule.guild_id, rule.channel_id, rule.creator, streamData, rule.discord_user_id);
                        
                        // Update cache with new stream info
                        const cacheData = { 
                            live: true, 
                            timestamp: Date.now(),
                            streamStartedAt: streamData.started_at,
                            streamId: currentStreamId,
                            lastNotificationSent: Date.now()
                        };
                        global.creatorAlertCache[cacheKey] = cacheData;
                        
                        // Persist to database
                        await updateCacheInDb(cacheKey, cacheData);
                    } else {
                        // Same stream, just update timestamp to keep it fresh
                        global.creatorAlertCache[cacheKey].timestamp = Date.now();
                        
                        // Update timestamp in database
                        await updateCacheInDb(cacheKey, global.creatorAlertCache[cacheKey]);
                    }
                } else {
                    console.log(`[CREATOR-ALERTS] No status change for ${rule.creator} - still ${streamData ? 'live' : 'offline'}`);
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

module.exports = processCreatorAlerts;
