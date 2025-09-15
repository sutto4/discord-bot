const express = require('express');
const { getTwitchUserId, subscribeToStreamOnline, subscribeToStreamOffline } = require('../../../events/twitchEventSub');

/**
 * API endpoint to manually subscribe a creator to EventSub
 * POST /api/eventsub/subscribe
 * Body: { "creator": "suttogt" }
 */
module.exports = async (req, res) => {
    try {
        const { creator } = req.body;
        
        if (!creator) {
            return res.status(400).json({ 
                success: false, 
                error: 'Creator username is required' 
            });
        }
        
        console.log(`[EVENTSUB-API] Subscribing ${creator} to EventSub...`);
        
        // Get Twitch user ID
        const userId = await getTwitchUserId(creator);
        if (!userId) {
            return res.status(404).json({ 
                success: false, 
                error: `Twitch user '${creator}' not found` 
            });
        }
        
        // Subscribe to both online and offline events
        const onlineResult = await subscribeToStreamOnline(userId, creator);
        const offlineResult = await subscribeToStreamOffline(userId, creator);
        
        if (onlineResult && offlineResult) {
            res.json({ 
                success: true, 
                message: `Successfully subscribed ${creator} to EventSub`,
                userId: userId
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: `Failed to subscribe ${creator} to EventSub`,
                onlineResult,
                offlineResult
            });
        }
        
    } catch (error) {
        console.error('[EVENTSUB-API] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};
