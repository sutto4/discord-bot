const express = require('express');
const { immediateBotCustomizationUpdate } = require('./jobs/botCustomization');

const app = express();
const PORT = process.env.BOT_WEBHOOK_PORT || 3002;

// Middleware
app.use(express.json());

// Security middleware - simple API key check
const apiSecret = process.env.BOT_API_SECRET || 'default-secret';
app.use('/api', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${apiSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Bot customization update webhook
app.post('/api/bot-customization/update', async (req, res) => {
  try {
    const { guildId } = req.body;
    
    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' });
    }
    
    console.log(`[WEBHOOK] Received immediate update request for guild: ${guildId}`);
    
    // Wait for client to be ready (with timeout)
    let attempts = 0;
    const maxAttempts = 10;
    const delay = 1000; // 1 second
    
    while (!global.client && attempts < maxAttempts) {
      console.log(`[WEBHOOK] Waiting for Discord client to be ready... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }
    
    if (!global.client) {
      console.error('[WEBHOOK] Discord client not available after waiting');
      return res.status(503).json({ 
        error: 'Discord client not ready',
        message: 'Bot is still starting up, please try again in a moment'
      });
    }
    
    // Trigger the immediate update
    const success = await immediateBotCustomizationUpdate(guildId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Bot customization updated immediately for guild ${guildId}` 
      });
    } else {
      res.status(500).json({ 
        error: `Failed to update bot customization for guild ${guildId}` 
      });
    }
    
  } catch (error) {
    console.error('[WEBHOOK] Error processing update request:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Bot activity endpoint (admin-only via Next.js API)
app.post('/api/bot/activity', async (req, res) => {
  try {
    const { text, type } = req.body;
    
    if (!text || !type) {
      return res.status(400).json({ error: 'text and type are required' });
    }
    
    const validTypes = ['PLAYING', 'WATCHING', 'LISTENING', 'STREAMING'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'type must be one of: PLAYING, WATCHING, LISTENING, STREAMING' });
    }
    
    console.log(`[WEBHOOK] Received bot activity update request: ${type} ${text}`);
    
    // Wait for client to be ready (with timeout)
    let attempts = 0;
    const maxAttempts = 10;
    const delay = 1000; // 1 second
    
    while (!global.client && attempts < maxAttempts) {
      console.log(`[WEBHOOK] Waiting for Discord client to be ready... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }
    
    if (!global.client) {
      console.error('[WEBHOOK] Discord client not available after waiting');
      return res.status(503).json({ 
        error: 'Discord client not ready',
        message: 'Bot is still starting up, please try again in a moment'
      });
    }
    
    // Update bot activity
    const success = global.updateBotActivity(text, type);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Bot activity updated successfully',
        activity: { text, type }
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to update bot activity',
        message: 'Check logs for details'
      });
    }
    
  } catch (error) {
    console.error('[WEBHOOK] Bot activity update error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Bot activity refresh endpoint (updates with user count)
app.post('/api/bot/activity/refresh', async (req, res) => {
  try {
    console.log(`[WEBHOOK] Received bot activity refresh request`);
    
    // Wait for client to be ready (with timeout)
    let attempts = 0;
    const maxAttempts = 10;
    const delay = 1000; // 1 second
    
    while (!global.client && attempts < maxAttempts) {
      console.log(`[WEBHOOK] Waiting for Discord client to be ready... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempts++;
    }
    
    if (!global.client) {
      console.error('[WEBHOOK] Discord client not available after waiting');
      return res.status(503).json({ 
        error: 'Discord client not ready',
        message: 'Bot is still starting up, please try again in a moment'
      });
    }
    
    // Update bot activity with user count
    const success = await global.updateBotActivityWithUserCount(global.client);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Bot activity refreshed with latest user count'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to refresh bot activity',
        message: 'Check logs for details'
      });
    }
    
  } catch (error) {
    console.error('[WEBHOOK] Bot activity refresh error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`[WEBHOOK] Bot webhook server running on port ${PORT}`);
});

module.exports = app;
