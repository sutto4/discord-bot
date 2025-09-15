const crypto = require('crypto');
const { pool } = require('../config/database-multi-guild');

// Twitch EventSub configuration
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || 'your-webhook-secret-here';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://your-domain.com';

let twitchAccessToken = null;
let twitchTokenExpiry = 0;

/**
 * Get or refresh Twitch access token for EventSub
 */
async function getTwitchToken() {
    const now = Date.now();
    
    if (twitchAccessToken && now < twitchTokenExpiry) {
        return twitchAccessToken;
    }
    
    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });
        
        const data = await response.json();
        
        if (data.access_token) {
            twitchAccessToken = data.access_token;
            twitchTokenExpiry = now + (data.expires_in * 1000) - 60000; // 1 min buffer
            console.log('[TWITCH-EVENTSUB] ✅ Token refreshed successfully');
            return twitchAccessToken;
        } else {
            throw new Error('No access token in response');
        }
    } catch (error) {
        console.error('[TWITCH-EVENTSUB] ❌ Error getting token:', error);
        return null;
    }
}

/**
 * Verify Twitch webhook signature
 */
function verifyTwitchSignature(signature, timestamp, body, secret = WEBHOOK_SECRET) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(timestamp + body)
        .digest('hex');
    
    const providedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
    );
}

/**
 * Get Twitch user ID by username
 */
async function getTwitchUserId(username) {
    try {
        const token = await getTwitchToken();
        if (!token) return null;
        
        const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        return data.data?.[0]?.id || null;
    } catch (error) {
        console.error(`[TWITCH-EVENTSUB] Error getting user ID for ${username}:`, error);
        return null;
    }
}

/**
 * Subscribe to Twitch EventSub for a specific broadcaster
 */
async function subscribeToStreamOnline(broadcasterUserId, broadcasterName) {
    try {
        const token = await getTwitchToken();
        if (!token) {
            console.error('[TWITCH-EVENTSUB] No token available for subscription');
            return false;
        }
        
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'stream.online',
                version: '1',
                condition: {
                    broadcaster_user_id: broadcasterUserId
                },
                transport: {
                    method: 'webhook',
                    callback: `${WEBHOOK_BASE_URL}/webhook/twitch`,
                    secret: WEBHOOK_SECRET
                }
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log(`[TWITCH-EVENTSUB] ✅ Subscribed to stream.online for ${broadcasterName} (${broadcasterUserId})`);
            
            // Store subscription in database
            await pool.execute(
                `INSERT INTO twitch_eventsub_subscriptions (subscription_id, broadcaster_user_id, broadcaster_name, event_type, status, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE status = ?, updated_at = NOW()`,
                [data.data[0].id, broadcasterUserId, broadcasterName, 'stream.online', 'enabled', 'enabled']
            );
            
            return true;
        } else {
            console.error(`[TWITCH-EVENTSUB] ❌ Failed to subscribe for ${broadcasterName}:`, data);
            return false;
        }
    } catch (error) {
        console.error(`[TWITCH-EVENTSUB] ❌ Error subscribing for ${broadcasterName}:`, error);
        return false;
    }
}

/**
 * Subscribe to stream.offline events
 */
async function subscribeToStreamOffline(broadcasterUserId, broadcasterName) {
    try {
        const token = await getTwitchToken();
        if (!token) return false;
        
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'stream.offline',
                version: '1',
                condition: {
                    broadcaster_user_id: broadcasterUserId
                },
                transport: {
                    method: 'webhook',
                    callback: `${WEBHOOK_BASE_URL}/webhook/twitch`,
                    secret: WEBHOOK_SECRET
                }
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log(`[TWITCH-EVENTSUB] ✅ Subscribed to stream.offline for ${broadcasterName} (${broadcasterUserId})`);
            
            await pool.execute(
                `INSERT INTO twitch_eventsub_subscriptions (subscription_id, broadcaster_user_id, broadcaster_name, event_type, status, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE status = ?, updated_at = NOW()`,
                [data.data[0].id, broadcasterUserId, broadcasterName, 'stream.offline', 'enabled', 'enabled']
            );
            
            return true;
        } else {
            console.error(`[TWITCH-EVENTSUB] ❌ Failed to subscribe to offline for ${broadcasterName}:`, data);
            return false;
        }
    } catch (error) {
        console.error(`[TWITCH-EVENTSUB] ❌ Error subscribing to offline for ${broadcasterName}:`, error);
        return false;
    }
}

/**
 * Handle stream.online event
 */
async function handleStreamOnline(client, eventData) {
    try {
        const streamerId = eventData.broadcaster_user_id;
        const streamerName = eventData.broadcaster_user_login;
        const streamTitle = eventData.title || 'Untitled Stream';
        const gameId = eventData.category_id;
        const gameName = eventData.category_name || 'Unknown Game';
        
        console.log(`[TWITCH-EVENTSUB] 🔴 ${streamerName} went live: ${streamTitle}`);
        
        // Get all creator alerts for this Twitch user
        const [alerts] = await pool.execute(
            `SELECT * FROM creator_alerts 
             WHERE platform = 'twitch' AND creator = ? AND enabled = 1`,
            [streamerName]
        );
        
        if (alerts.length === 0) {
            console.log(`[TWITCH-EVENTSUB] No alerts configured for ${streamerName}`);
            return;
        }
        
        // Get stream thumbnail
        const streamThumbnail = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamerName.toLowerCase()}-640x360.jpg?t=${Date.now()}`;
        
        // Get streamer's profile image
        const streamerAvatar = await getStreamerProfileImage(streamerId);
        
        for (const alert of alerts) {
            try {
                const channel = await client.channels.fetch(alert.channel_id);
                if (!channel) {
                    console.warn(`[TWITCH-EVENTSUB] Channel ${alert.channel_id} not found for alert ${alert.id}`);
                    continue;
                }
                
                // Create embed
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle(`${streamerName} is now live!`)
                    .setDescription(streamTitle)
                    .setURL(`https://twitch.tv/${streamerName}`)
                    .setColor(0x9146FF) // Twitch purple
                    .setImage(streamThumbnail)
                    .setThumbnail(streamerAvatar)
                    .addFields(
                        { name: '🎮 Game', value: gameName, inline: true },
                        { name: '👁️ Watch', value: `[twitch.tv/${streamerName}](https://twitch.tv/${streamerName})`, inline: true }
                    )
                    .setTimestamp();
                
                // Custom message
                let message = alert.custom_message || '[user] has just gone live!';
                message = message.replace(/\[user\]/g, streamerName);
                
                // Role mention if specified
                let content = message;
                if (alert.role_id) {
                    content = `<@&${alert.role_id}> ${message}`;
                }
                
                await channel.send({
                    content: content,
                    embeds: [embed]
                });
                
                console.log(`[TWITCH-EVENTSUB] ✅ Sent alert for ${streamerName} to ${channel.name}`);
                
            } catch (channelError) {
                console.error(`[TWITCH-EVENTSUB] ❌ Error sending alert for ${streamerName}:`, channelError);
            }
        }
        
    } catch (error) {
        console.error('[TWITCH-EVENTSUB] ❌ Error handling stream.online:', error);
    }
}

/**
 * Handle stream.offline event
 */
async function handleStreamOffline(client, eventData) {
    const streamerName = eventData.broadcaster_user_login;
    console.log(`[TWITCH-EVENTSUB] ⚫ ${streamerName} went offline`);
    
    // Optional: Handle offline events (update status, etc.)
    // For now, just log it
}

/**
 * Get streamer's profile image
 */
async function getStreamerProfileImage(userId) {
    try {
        const token = await getTwitchToken();
        if (!token) return null;
        
        const response = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        return data.data?.[0]?.profile_image_url || null;
    } catch (error) {
        console.error('[TWITCH-EVENTSUB] Error getting profile image:', error);
        return null;
    }
}

/**
 * Subscribe all existing creator alerts to EventSub
 */
async function subscribeAllExistingAlerts() {
    try {
        console.log('[TWITCH-EVENTSUB] 🔄 Subscribing existing creator alerts to EventSub...');
        
        const [alerts] = await pool.execute(
            `SELECT DISTINCT creator FROM creator_alerts 
             WHERE platform = 'twitch' AND enabled = 1`
        );
        
        for (const alert of alerts) {
            const userId = await getTwitchUserId(alert.creator);
            if (userId) {
                await subscribeToStreamOnline(userId, alert.creator);
                await subscribeToStreamOffline(userId, alert.creator);
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`[TWITCH-EVENTSUB] ✅ Subscribed ${alerts.length} creators to EventSub`);
    } catch (error) {
        console.error('[TWITCH-EVENTSUB] ❌ Error subscribing existing alerts:', error);
    }
}

/**
 * Process webhook event
 */
async function processWebhookEvent(client, headers, body) {
    try {
        const signature = headers['twitch-eventsub-message-signature'];
        const timestamp = headers['twitch-eventsub-message-timestamp'];
        const messageType = headers['twitch-eventsub-message-type'];
        
        // Verify signature
        if (!verifyTwitchSignature(signature, timestamp, body)) {
            console.error('[TWITCH-EVENTSUB] ❌ Invalid signature');
            return { status: 403, message: 'Forbidden' };
        }
        
        const event = JSON.parse(body);
        
        // Handle different message types
        switch (messageType) {
            case 'webhook_callback_verification':
                console.log('[TWITCH-EVENTSUB] ✅ Webhook verification challenge received');
                return { status: 200, message: event.challenge };
                
            case 'notification':
                const eventType = event.subscription.type;
                
                if (eventType === 'stream.online') {
                    await handleStreamOnline(client, event.event);
                } else if (eventType === 'stream.offline') {
                    await handleStreamOffline(client, event.event);
                }
                
                return { status: 200, message: 'OK' };
                
            case 'revocation':
                console.warn('[TWITCH-EVENTSUB] ⚠️ Subscription revoked:', event.subscription);
                return { status: 200, message: 'OK' };
                
            default:
                console.warn('[TWITCH-EVENTSUB] ⚠️ Unknown message type:', messageType);
                return { status: 200, message: 'OK' };
        }
        
    } catch (error) {
        console.error('[TWITCH-EVENTSUB] ❌ Error processing webhook:', error);
        return { status: 500, message: 'Internal Server Error' };
    }
}

module.exports = {
    getTwitchUserId,
    subscribeToStreamOnline,
    subscribeToStreamOffline,
    subscribeAllExistingAlerts,
    processWebhookEvent,
    handleStreamOnline,
    handleStreamOffline
};
