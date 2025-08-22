const { appDb } = require('../config/database');

/**
 * Apply bot customization settings for a specific guild
 */
async function applyBotCustomization(client, guildId) {
    try {
        // Get bot customization settings from database
        const [rows] = await appDb.query(
            `SELECT 
                bot_name, 
                bot_avatar, 
                embed_color, 
                response_style, 
                auto_responses, 
                welcome_dm, 
                welcome_message, 
                goodbye_message, 
                log_level, 
                command_cooldown, 
                max_response_length
             FROM bot_customization 
             WHERE guild_id = ?`,
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
        if (settings.bot_avatar && settings.bot_avatar !== client.user.displayAvatarURL()) {
            try {
                // Download the image and set it as avatar
                const response = await fetch(settings.bot_avatar);
                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    await client.user.setAvatar(Buffer.from(buffer));
                    console.log(`[BOT-CUSTOMIZATION] Updated bot avatar in guild ${guild.name}`);
                } else {
                    console.error(`[BOT-CUSTOMIZATION] Failed to download avatar from ${settings.bot_avatar}`);
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
            `SELECT * FROM bot_customization WHERE guild_id = ?`,
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
        const {
            bot_name,
            bot_avatar,
            embed_color,
            response_style,
            auto_responses,
            welcome_dm,
            welcome_message,
            goodbye_message,
            log_level,
            command_cooldown,
            max_response_length
        } = settings;
        
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
                  embed_color = ?,
                  response_style = ?,
                  auto_responses = ?,
                  welcome_dm = ?,
                  welcome_message = ?,
                  goodbye_message = ?,
                  log_level = ?,
                  command_cooldown = ?,
                  max_response_length = ?,
                  updated_at = CURRENT_TIMESTAMP
                 WHERE guild_id = ?`,
                [
                    bot_name,
                    bot_avatar || null,
                    embed_color || "#5865F2",
                    response_style || "friendly",
                    auto_responses ? 1 : 0,
                    welcome_dm ? 1 : 0,
                    welcome_message || "",
                    goodbye_message || "",
                    log_level || "normal",
                    command_cooldown || 3,
                    max_response_length || 2000,
                    guildId
                ]
            );
        } else {
            // Insert new settings
            await appDb.query(
                `INSERT INTO bot_customization (
                  guild_id, bot_name, bot_avatar, embed_color, response_style, 
                  auto_responses, welcome_dm, welcome_message, goodbye_message, 
                  log_level, command_cooldown, max_response_length
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    guildId,
                    bot_name,
                    bot_avatar || null,
                    embed_color || "#5865F2",
                    response_style || "friendly",
                    auto_responses ? 1 : 0,
                    welcome_dm ? 1 : 0,
                    welcome_message || "",
                    goodbye_message || "",
                    log_level || "normal",
                    command_cooldown || 3,
                    max_response_length || 2000
                ]
            );
        }
        
        console.log(`[BOT-CUSTOMIZATION] Settings updated for guild ${guildId}`);
        return true;
        
    } catch (error) {
        console.error(`[BOT-CUSTOMIZATION] Error updating customization for guild ${guildId}:`, error);
        return false;
    }
}

module.exports = {
    applyBotCustomization,
    applyBotCustomizationForAllGuilds,
    getBotCustomization,
    updateBotCustomization
};
