const express = require('express');
const router = express.Router();

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
router.post('/:guildId/enable-premium', verifyBotApiKey, async (req, res) => {
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
    
    // Debug: Check what guilds are available
    console.log('Available guilds in cache:', Array.from(client.guilds.cache.keys()));
    console.log('Looking for guild ID:', guildId);
    console.log('Guild found:', client.guilds.cache.has(guildId));
    
    // Get the guild from the bot's cache
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) {
      console.log(`Guild ${guildId} not found in bot cache`);
      return res.status(404).json({ error: 'Guild not found' });
    }
    
    // Enable premium features based on the plan type
    await enablePremiumFeatures(guild, planType, subscriptionId);
    
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

// Function to enable premium features for a guild
async function enablePremiumFeatures(guild, planType, subscriptionId) {
  try {
    // Update guild status in database if needed
    const { GuildDatabase } = require('../../config/database-multi-guild');
    await GuildDatabase.updateGuildPremiumStatus(guild.id, true, planType, subscriptionId);
    
    // Enable specific features based on plan type
    switch (planType?.toLowerCase()) {
      case 'solo':
        await enableSoloFeatures(guild);
        break;
      case 'squad':
        await enableSquadFeatures(guild);
        break;
      case 'city':
        await enableCityFeatures(guild);
        break;
      case 'enterprise':
        await enableEnterpriseFeatures(guild);
        break;
      default:
        await enableBasicPremiumFeatures(guild);
    }
    
    console.log(`Premium features enabled for guild ${guild.name} (${guild.id})`);
    
  } catch (error) {
    console.error(`Failed to enable premium features for guild ${guild.id}:`, error);
    throw error;
  }
}

// Enable basic premium features (available to all premium plans)
async function enableBasicPremiumFeatures(guild) {
  // Enable custom commands
  await enableCustomCommands(guild);
  
  // Enable advanced role management
  await enableAdvancedRoleManagement(guild);
  
  // Enable premium logging
  await enablePremiumLogging(guild);
}

// Enable Solo plan features
async function enableSoloFeatures(guild) {
  await enableBasicPremiumFeatures(guild);
  // Solo-specific features
  await enableBasicAnalytics(guild);
}

// Enable Squad plan features
async function enableSquadFeatures(guild) {
  await enableSoloFeatures(guild);
  // Squad-specific features
  await enableServerGroups(guild);
  await enableAdvancedAnalytics(guild);
}

// Enable City plan features
async function enableCityFeatures(guild) {
  await enableSquadFeatures(guild);
  // City-specific features
  await enableCustomIntegrations(guild);
  await enablePrioritySupport(guild);
}

// Enable Enterprise plan features
async function enableEnterpriseFeatures(guild) {
  await enableCityFeatures(guild);
  // Enterprise-specific features
  await enableWhiteLabeling(guild);
  await enableDedicatedSupport(guild);
}

// Feature enablement functions
async function enableCustomCommands(guild) {
  console.log(`Enabling custom commands for guild ${guild.name}`);
  // Implementation for enabling custom commands
}

async function enableAdvancedRoleManagement(guild) {
  console.log(`Enabling advanced role management for guild ${guild.name}`);
  // Implementation for enabling advanced role management
}

async function enablePremiumLogging(guild) {
  console.log(`Enabling premium logging for guild ${guild.name}`);
  // Implementation for enabling premium logging
}

async function enableBasicAnalytics(guild) {
  console.log(`Enabling basic analytics for guild ${guild.name}`);
  // Implementation for enabling basic analytics
}

async function enableServerGroups(guild) {
  console.log(`Enabling server groups for guild ${guild.name}`);
  // Implementation for enabling server groups
}

async function enableAdvancedAnalytics(guild) {
  console.log(`Enabling advanced analytics for guild ${guild.name}`);
  // Implementation for enabling advanced analytics
}

async function enableCustomIntegrations(guild) {
  console.log(`Enabling custom integrations for guild ${guild.name}`);
  // Implementation for enabling custom integrations
}

async function enablePrioritySupport(guild) {
  console.log(`Enabling priority support for guild ${guild.name}`);
  // Implementation for enabling priority support
}

async function enableWhiteLabeling(guild) {
  console.log(`Enabling white labeling for guild ${guild.name}`);
  // Implementation for enabling white labeling
}

async function enableDedicatedSupport(guild) {
  console.log(`Enabling dedicated support for guild ${guild.name}`);
  // Implementation for enabling dedicated support
}

module.exports = router;
