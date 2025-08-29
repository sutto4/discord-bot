const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../config/database-multi-guild');

// ServerMate Guild ID (hardcoded for management feature)
const SERVERMATE_GUILD_ID = '1403257704222429224';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setdmreply')
        .setDescription('🔧 ServerMate Management: Configure DM logging channel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set the ServerMate channel for DM logging')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The ServerMate channel to log incoming DMs')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show ServerMate DM logging status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable DM logging for ServerMate')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false), // Cannot be used in DMs

    async execute(interaction) {
        // Only allow in ServerMate guild
        if (interaction.guildId !== SERVERMATE_GUILD_ID) {
            return await interaction.reply({
                content: '❌ **ServerMate Management Only**\n\nThis command is only available in the ServerMate Discord server for bot management purposes.',
                flags: 64
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('channel');

                // Check if it's a text channel
                if (channel.type !== 0) {
                    return interaction.reply({
                        content: '❌ Please select a text channel.',
                        flags: 64
                    });
                }

                // Check bot permissions in the channel
                const permissions = channel.permissionsFor(interaction.client.user);
                if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                    return interaction.reply({
                        content: '❌ I need Send Messages and Embed Links permissions in that channel.',
                        flags: 64
                    });
                }

                // Update DM logging settings for ServerMate
                await pool.execute(
                    'INSERT INTO dm_reply_settings (guild_id, channel_id, enabled) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE channel_id = ?, enabled = TRUE',
                    [SERVERMATE_GUILD_ID, channel.id, channel.id]
                );

                await interaction.reply({
                    content: `✅ **ServerMate DM Logging Configured**\n\nDMs to the bot will now be logged to ${channel}\n\n**Management Features:**\n• Auto-reply with ServerMate invite\n• Detailed logging with user info\n• Attachment support\n• Timestamp tracking`,
                    flags: 64
                });

            } else if (subcommand === 'status') {
                // Get DM logging settings for ServerMate
                const [settings] = await pool.execute(
                    'SELECT channel_id, enabled FROM dm_reply_settings WHERE guild_id = ?',
                    [SERVERMATE_GUILD_ID]
                );

                if (settings && settings.length > 0 && settings[0].enabled && settings[0].channel_id) {
                    const channel = interaction.guild.channels.cache.get(settings[0].channel_id);

                    if (channel) {
                        await interaction.reply({
                            content: `✅ **ServerMate DM Logging: ACTIVE**\n\n**Channel:** ${channel}\n**Status:** Receiving and logging DMs\n**Features:** Auto-reply + detailed logging`,
                            flags: 64
                        });
                    } else {
                        await interaction.reply({
                            content: `⚠️ **ServerMate DM Logging: CONFIGURED BUT CHANNEL MISSING**\n\nConfigured channel ID: ${settings[0].channel_id}\n\nPlease reconfigure with a valid channel.`,
                            flags: 64
                        });
                    }
                } else {
                    await interaction.reply({
                        content: `🔒 **ServerMate DM Logging: DISABLED**\n\nDM logging is currently disabled.\n\n**Management Features:**\n• Auto-reply with ServerMate invite\n• Detailed logging with user info\n• Attachment support\n\nUse \`/setdmreply channel\` to enable.`,
                        flags: 64
                    });
                }

            } else if (subcommand === 'disable') {
                // Disable DM logging for ServerMate
                await pool.execute(
                    'UPDATE dm_reply_settings SET enabled = FALSE WHERE guild_id = ?',
                    [SERVERMATE_GUILD_ID]
                );

                await interaction.reply({
                    content: `🔒 **ServerMate DM Logging: DISABLED**\n\nDM logging has been disabled.\n\n**Note:** The bot will still auto-reply to DMs with ServerMate invite, but won't log them.`,
                    flags: 64
                });
            }

        } catch (error) {
            console.error('Error in setdmreply command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing the command.',
                flags: 64
            });
        }
    },
};

