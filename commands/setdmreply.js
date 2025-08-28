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
                        ephemeral: true
                    });
                }

                // Check bot permissions in the channel
                const permissions = channel.permissionsFor(interaction.client.user);
                if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                    return interaction.reply({
                        content: '❌ I need Send Messages and Embed Links permissions in that channel.',
                        ephemeral: true
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
                    ephemeral: true
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
                            ephemeral: true
                        });
                    } else {
                        await interaction.reply({
                            content: '⚠️ DM reply forwarding is enabled but the configured channel no longer exists.',
                            ephemeral: true
                        });
                    }
                } else if (settings && !settings.enabled) {
                    await interaction.reply({
                        content: '❌ DM reply forwarding is **disabled**.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ DM reply forwarding is not configured for this server.',
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('Error in setdmreply command:', error);
            await interaction.reply({
                content: '❌ An error occurred while updating the settings.',
                ephemeral: true
            });
        }
    },
};

