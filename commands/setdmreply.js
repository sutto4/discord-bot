const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../config/database-multi-guild');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setdmreply')
        .setDescription('Configure DM reply forwarding settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set the channel and enable/disable DM reply forwarding')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to send DM replies to')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable DM reply forwarding (defaults to enabled)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current DM reply settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all servers with DM reply enabled')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            if (subcommand === 'channel') {
                const channel = interaction.options.getChannel('channel');
                const enabled = interaction.options.getBoolean('enabled') ?? true; // Default to true if not specified

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

                // Insert or update the setting
                await pool.execute(
                    'INSERT INTO dm_reply_settings (guild_id, channel_id, enabled) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE channel_id = ?, enabled = ?',
                    [guildId, channel.id, enabled, channel.id, enabled]
                );

                const status = enabled ? 'enabled' : 'disabled';
                await interaction.reply({
                    content: `✅ DM reply forwarding has been ${status} and will forward to ${channel}`,
                    flags: 64
                });

            } else if (subcommand === 'status') {
                // Get current settings
                const [settings] = await pool.execute(
                    'SELECT channel_id, enabled FROM dm_reply_settings WHERE guild_id = ?',
                    [guildId]
                );

                console.log(`[DM-REPLY-DEBUG] Status check for guild ${guildId}:`, settings);

                if (settings && settings.enabled && settings.channel_id) {
                    const channel = interaction.guild.channels.cache.get(settings.channel_id);
                    if (channel) {
                        await interaction.reply({
                            content: `✅ DM reply forwarding is **enabled** and forwarding to ${channel}`,
                            flags: 64
                        });
                    } else {
                        await interaction.reply({
                            content: '⚠️ DM reply forwarding is enabled but the configured channel no longer exists.',
                            flags: 64
                        });
                    }
                } else if (settings && !settings.enabled) {
                    await interaction.reply({
                        content: '❌ DM reply forwarding is **disabled**.',
                        flags: 64
                    });
                } else {
                    await interaction.reply({
                        content: '❌ DM reply forwarding is not configured for this server.',
                        flags: 64
                    });
                }

            } else if (subcommand === 'list') {
                // List all servers with DM reply enabled
                const [allSettings] = await pool.execute(
                    'SELECT ds.guild_id, ds.channel_id, ds.enabled, g.guild_name FROM dm_reply_settings ds LEFT JOIN guilds g ON ds.guild_id = g.guild_id WHERE ds.enabled = TRUE ORDER BY g.guild_name'
                );

                if (!allSettings || allSettings.length === 0) {
                    await interaction.reply({
                        content: '❌ No servers have DM reply forwarding enabled.',
                        flags: 64
                    });
                    return;
                }

                let response = '**📋 Servers with DM Reply Forwarding Enabled:**\n\n';

                for (const setting of allSettings) {
                    const guildName = setting.guild_name || `Server ${setting.guild_id}`;
                    const currentServer = setting.guild_id === guildId ? ' (current)' : '';
                    response += `• **${guildName}**${currentServer}\n`;
                    response += `  └ Channel: <#${setting.channel_id}>\n\n`;
                }

                // Truncate if too long for Discord
                if (response.length > 2000) {
                    response = response.substring(0, 1990) + '\n\n... (truncated)';
                }

                await interaction.reply({
                    content: response,
                    flags: 64
                });
            }

        } catch (error) {
            console.error('Error in setdmreply command:', error);
            await interaction.reply({
                content: '❌ An error occurred while updating the settings.',
                flags: 64
            });
        }
    },
};

