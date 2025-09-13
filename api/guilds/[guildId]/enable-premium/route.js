const express = require('express');
const router = express.Router({ mergeParams: true });

// Import the working database connection
const { appDb } = require('../../../../config/database');
console.log('[ROUTE] Successfully imported appDb:', typeof appDb);

// Middleware to verify bot API key
const verifyBotApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.BOT_API_KEY;
  
  if (!apiKey) {
    console.error('BOT_API_KEY not configured');
    return res.status(500).json({ error: 'Bot API not configured' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  if (token !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// POST /guilds/:guildId/enable-premium
router.post('/enable-premium', verifyBotApiKey, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { subscriptionId, planType, action } = req.body;
    
    
    
    console.log(`Enabling premium features for guild ${guildId}`, {
      subscriptionId,
      planType,
      action
    });
    
    // Get the Discord client from the Express app
    const client = req.app.get('client') || req.client;
    
    if (!client) {
      console.error('Discord client not available');
      return res.status(500).json({ error: 'Discord client not available' });
    }
    
    
    
    // Get the guild from the bot's cache
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      console.log(`Guild ${guildId} not found in bot cache`);
      return res.status(404).json({ error: 'Guild not found' });
    }
    
         // Update the guild's premium status in the database
     await updateGuildPremiumStatus(guild.id, true, planType, subscriptionId);
     
     // Enable all premium features in guild_features table (same as new subscription processing)
     await enablePremiumFeatures(guild.id);
     
     console.log(`Premium features enabled for guild ${guildId} (${guild.name})`);
     
     res.json({
       success: true,
       message: `Premium features enabled for guild ${guild.name}`,
       guildId,
       planType
     });
    
  } catch (error) {
    console.error('Error enabling premium features:', error);
    res.status(500).json({
      error: 'Failed to enable premium features',
      details: error.message
    });
  }
});

// Function to update guild premium status in database
async function updateGuildPremiumStatus(guildId, isPremium, planType, subscriptionId) {
  try {
    console.log(`🗄️ Updating guild ${guildId} premium status: ${isPremium ? 'enabled' : 'disabled'} (${planType})`);
    
         // Update the guild's premium status
     await appDb.execute(`
       UPDATE guilds 
       SET premium = ?, 
           subscription_id = ?,
           product_name = ?,
           subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ?
     `, [isPremium ? 1 : 0, subscriptionId, planType, guildId]);
    
         // Note: guild_premium_logs table doesn't exist in current schema
     console.log(`📝 Would log premium status change for guild ${guildId} (table not implemented yet)`);
    
    console.log(`✅ Guild ${guildId} premium status updated successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Database update failed for guild ${guildId}:`, error);
    throw error;
  }
}

// Function to enable premium features in guild_features table (same as new subscription processing)
async function enablePremiumFeatures(guildId) {
  try {
    console.log(`🔧 Enabling premium features for guild ${guildId}...`);
    
         // Get all premium features from the features table
     const [premiumFeatures] = await appDb.execute(`
       SELECT feature_key, feature_name 
       FROM features 
       WHERE minimum_package = 'premium' AND is_active = 1
     `);
    
    console.log(`Found ${premiumFeatures.length} premium features to enable:`, premiumFeatures);
    
    if (!Array.isArray(premiumFeatures) || premiumFeatures.length === 0) {
      console.log('No premium features found to enable');
      return;
    }
    
         // Note: guild_features table should already exist from core schema
     console.log(`📋 Using existing guild_features table for guild ${guildId}`);
    
    // Enable each premium feature
    for (const feature of premiumFeatures) {
      const featureName = feature.feature_key || feature.feature_name;
      console.log(`Enabling feature: ${featureName} for guild ${guildId}`);
      
             await appDb.execute(`
         INSERT INTO guild_features (guild_id, feature_key, enabled) 
         VALUES (?, ?, 1) 
         ON DUPLICATE KEY UPDATE enabled = 1, updated_at = CURRENT_TIMESTAMP
       `, [guildId, featureName]);
    }
    
    console.log(`✅ Successfully enabled ${premiumFeatures.length} premium features for guild ${guildId}`);
    
  } catch (error) {
    console.error(`❌ Failed to enable premium features for guild ${guildId}:`, error);
    throw error;
  }
}

     

module.exports = router;
