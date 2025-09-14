const { appDb } = require('../config/database');

/**
 * Apply bot customization settings for a specific guild
 */
async function applyBotCustomization(client, guildId) {
    try {
        // Get bot customization settings from database
        const [rows] = await appDb.query(
            `SELECT bot_name, bot_avatar FROM bot_customization WHERE guild_id = ?`,
            [guildId]
        );
        
        if (rows.length === 0) {
            console.log(`[BOT-CUSTOMIZATION] No customization settings found for guild ${guildId}`);
            return;
        }
        
        const settings = rows[0];
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            console.log(`[BOT-CUSTOMIZATION] Guild ${guildId} not found in bot cache`);
            return;
        }
        
        console.log(`[BOT-CUSTOMIZATION] Applying settings for guild ${guild.name} (${guildId})`);
        
        // Apply bot name change if different from current
        if (settings.bot_name && settings.bot_name !== guild.members.me?.displayName) {
            try {
                await guild.members.me.setNickname(settings.bot_name, 'Bot Customization Update');
                console.log(`[BOT-CUSTOMIZATION] Updated bot name to "${settings.bot_name}" in guild ${guild.name}`);
            } catch (error) {
                console.error(`[BOT-CUSTOMIZATION] Failed to update bot name in guild ${guild.name}:`, error.message);
            }
        }
        
        // Apply bot avatar change if different from current
        if (settings.bot_avatar) {
            try {
                // Extract the base avatar URL without Discord's dynamic CDN parameters
                const currentAvatarURL = client.user.displayAvatarURL({ dynamic: true });
                const currentAvatarBase = currentAvatarURL.split('?')[0]; // Remove query parameters
                const newAvatarBase = settings.bot_avatar.split('?')[0]; // Remove query parameters

                // Only update if the base URLs are actually different
                if (newAvatarBase !== currentAvatarBase) {
                    console.log(`[BOT-CUSTOMIZATION] Avatar URLs differ - updating avatar`);
                    console.log(`[BOT-CUSTOMIZATION] Current: ${currentAvatarBase}`);
                    console.log(`[BOT-CUSTOMIZATION] New: ${newAvatarBase}`);

                    // Download the image and set it as avatar
                    const response = await fetch(settings.bot_avatar);
                    if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        await client.user.setAvatar(Buffer.from(buffer));
                        console.log(`[BOT-CUSTOMIZATION] Updated bot avatar in guild ${guild.name}`);
                    } else {
                        console.error(`[BOT-CUSTOMIZATION] Failed to download avatar from ${settings.bot_avatar}`);
                    }
                } else {
                    console.log(`[BOT-CUSTOMIZATION] Avatar URL unchanged for guild ${guild.name} - skipping update`);
                }
            } catch (error) {
                console.error(`[BOT-CUSTOMIZATION] Failed to update bot avatar in guild ${guild.name}:`, error.message);
            }
        }
        
        // Store settings in guild cache for easy access
        if (!guild.botCustomization) {
            guild.botCustomization = {};
        }
        
        guild.botCustomization = {
            ...settings,
            lastUpdated: Date.now()
        };
        
        console.log(`[BOT-CUSTOMIZATION] Successfully applied customization for guild ${guild.name}`);
        
    } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Error applying customization for guild ${guildId}:`, error);
    }
}

/**
 * Apply bot customization for all guilds
 */
async function applyBotCustomizationForAllGuilds(client) {
    try {
        console.log('[BOT-CUSTOMIZATION] Starting bot customization sync for all guilds...');
        
        // Get all guilds where the bot has customization settings
        const [guilds] = await appDb.query(
            `SELECT DISTINCT guild_id FROM bot_customization`
        );
        
        if (guilds.length === 0) {
            console.log('[BOT-CUSTOMIZATION] No guilds with customization settings found');
            return;
        }
        
        console.log(`[BOT-CUSTOMIZATION] Found ${guilds.length} guilds with customization settings`);
        
        // Apply customization for each guild
        for (const guildRow of guilds) {
            await applyBotCustomization(client, guildRow.guild_id);
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('[BOT-CUSTOMIZATION] Completed bot customization sync for all guilds');
        
    } catch (error) {
        console.error('[BOT-CUSTOMIZATION] Error during bot customization sync:', error);
    }
}

/**
 * Get bot customization settings for a specific guild
 */
async function getBotCustomization(guildId) {
    try {
        const [rows] = await appDb.query(
            `SELECT bot_name, bot_avatar FROM bot_customization WHERE guild_id = ?`,
            [guildId]
        );
        
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Error getting customization for guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Update bot customization settings
 */
async function updateBotCustomization(guildId, settings) {
    try {
        const { bot_name, bot_avatar } = settings;
        
        // Check if settings exist for this guild
        const [existing] = await appDb.query(
            `SELECT guild_id FROM bot_customization WHERE guild_id = ?`,
            [guildId]
        );
        
        if (existing) {
            // Update existing settings
            await appDb.query(
                `UPDATE bot_customization SET
                  bot_name = ?,
                  bot_avatar = ?,
                  updated_at = CURRENT_TIMESTAMP
                 WHERE guild_id = ?`,
                [bot_name, bot_avatar || null, guildId]
            );
        } else {
            // Insert new settings
            await appDb.query(
                `INSERT INTO bot_customization (guild_id, bot_name, bot_avatar) VALUES (?, ?, ?)`,
                [guildId, bot_name, bot_avatar || null]
            );
        }
        
        console.log(`[BOT-CUSTOMIZATION] Settings updated for guild ${guildId}`);
        return true;
        
    } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Error updating customization for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Immediate bot customization update for a specific guild
 * Called via webhook when settings are changed in the UI
 */
async function immediateBotCustomizationUpdate(guildId) {
  try {
    console.log(`[BOT-CUSTOMIZATION] Immediate update requested for guild: ${guildId}`);
    
    // Check if client is available
    if (!global.client) {
      console.log(`[BOT-CUSTOMIZATION] Discord client not available yet, skipping immediate update`);
      return false;
    }
    
    // Get the guild
    const guild = global.client.guilds.cache.get(guildId);
    if (!guild) {
      console.log(`[BOT-CUSTOMIZATION] Guild not found: ${guildId}`);
      return false;
    }
    
    // Get customization settings
    const settings = await getBotCustomization(guildId);
    if (!settings) {
      console.log(`[BOT-CUSTOMIZATION] No settings found for guild: ${guildId}`);
      return false;
    }
    
    console.log(`[BOT-CUSTOMIZATION] Applying immediate update for guild: ${guildId}`);
    
    // Apply bot name change
    if (settings.bot_name && settings.bot_name.trim() !== '') {
      try {
        await guild.members.me.setNickname(settings.bot_name.trim());
        console.log(`[BOT-CUSTOMIZATION] Bot name updated to: ${settings.bot_name.trim()}`);
      } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Failed to update bot name:`, error.message);
      }
    }
    
    // Apply bot avatar change
    if (settings.bot_avatar && settings.bot_avatar.trim() !== '') {
      try {
        // Check if avatar actually changed to avoid rate limiting
        const currentAvatarURL = global.client.user.displayAvatarURL({ dynamic: true });
        const currentAvatarBase = currentAvatarURL.split('?')[0];
        const newAvatarBase = settings.bot_avatar.trim().split('?')[0];

        if (newAvatarBase !== currentAvatarBase) {
          await global.client.user.setAvatar(settings.bot_avatar.trim());
          console.log(`[BOT-CUSTOMIZATION] Bot avatar updated`);
        } else {
          console.log(`[BOT-CUSTOMIZATION] Avatar unchanged - skipping update to avoid rate limit`);
        }
      } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Failed to update bot avatar:`, error.message);
      }
    }
    
    console.log(`[BOT-CUSTOMIZATION] Immediate update completed for guild: ${guildId}`);
    return true;
    
  } catch (error) {
    console.error(`[BOT-CUSTOMIZATION] Error during immediate update for guild ${guildId}:`, error);
    return false;
  }
}

module.exports = {
    applyBotCustomization,
    applyBotCustomizationForAllGuilds,
    getBotCustomization,
    updateBotCustomization,
    immediateBotCustomizationUpdate
};
