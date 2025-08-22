const express = require('express');
const { immediateBotCustomizationUpdate } = require('./jobs/botCustomization');

const app = express();
const PORT = process.env.BOT_WEBHOOK_PORT || 3001;

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`[WEBHOOK] Bot webhook server running on port ${PORT}`);
});

module.exports = app;
