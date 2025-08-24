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
           stripe_subscription_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE guild_id = ?
     `, [isPremium ? 1 : 0, subscriptionId, guildId]);
    
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
    
         // Create guild_features table if it doesn't exist
     await appDb.execute(`
       CREATE TABLE IF NOT EXISTS guild_features (
         id int(11) NOT NULL AUTO_INCREMENT,
         guild_id varchar(255) NOT NULL,
         feature_name varchar(255) NOT NULL,
         enabled tinyint(1) NOT NULL DEFAULT 0,
         created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY guild_feature (guild_id, feature_name),
         KEY guild_id (guild_id),
         KEY feature_name (feature_name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
     `);
    
    // Enable each premium feature
    for (const feature of premiumFeatures) {
      const featureName = feature.feature_key || feature.feature_name;
      console.log(`Enabling feature: ${featureName} for guild ${guildId}`);
      
             await appDb.execute(`
         INSERT INTO guild_features (guild_id, feature_name, enabled) 
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
