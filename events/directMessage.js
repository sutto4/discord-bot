const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { pool } = require('../config/database-multi-guild');

// ServerMate Guild ID (hardcoded for management feature)
const SERVERMATE_GUILD_ID = '1403257704222429224';

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Only process DMs (not guild messages) and ignore bot's own messages
        if (!message.guild && message.author.id !== message.client.user.id) {
            console.log(`[DM-MGMT] DM received from ${message.author.tag} (${message.author.id}): "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}"`);

            try {
                // Auto-reply with generic management message
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🤖 ServerMate Bot Support')
                    .setDescription('**This is an automated response from the ServerMate Discord bot.**\n\n' +
                        'Direct messages to this bot are not actively monitored for support requests. ' +
                        'For ServerMate-specific support, questions, or feedback, please join our Discord server.')
                    .setFooter({ text: 'ServerMate Management System', iconURL: message.client.user.displayAvatarURL() })
                    .setTimestamp();

                // Create button to ServerMate Discord
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Join ServerMate Discord')
                            .setStyle(ButtonStyle.Link)
                            .setURL('https://discord.gg/nrSjZByddw') // ServerMate Discord invite
                    );

                await message.reply({
                    embeds: [embed],
                    components: [row]
                });

                // Log DM to ServerMate's management channel only
                await logDmToServerMate(message);

                console.log(`[DM-MGMT] ✅ Auto-replied and logged DM from ${message.author.tag}`);

            } catch (error) {
                console.error(`[DM-MGMT] ❌ Error processing DM from ${message.author.tag}:`, error);
            }
        }
    },
};

async function logDmToServerMate(message) {
    try {
        // Get ServerMate guild
        const serverMateGuild = message.client.guilds.cache.get(SERVERMATE_GUILD_ID);
        if (!serverMateGuild) {
            console.log(`[DM-MGMT] ServerMate guild (${SERVERMATE_GUILD_ID}) not found`);
            return;
        }

        // Get DM logging settings from database
        const [settings] = await pool.execute(
            'SELECT channel_id FROM dm_reply_settings WHERE guild_id = ? AND enabled = TRUE',
            [SERVERMATE_GUILD_ID]
        );

        if (!settings || settings.length === 0) {
            console.log(`[DM-MGMT] No DM logging channel configured for ServerMate`);
            return;
        }

        const setting = settings[0];
        const logChannel = await serverMateGuild.channels.fetch(setting.channel_id);

        if (!logChannel) {
            console.log(`[DM-MGMT] DM logging channel (${setting.channel_id}) not found in ServerMate`);
            return;
        }

        // Create detailed log embed
        const logEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('📨 Incoming DM')
            .setDescription(`**From:** ${message.author.tag} (${message.author.id})`)
            .addFields(
                { name: '📝 Message', value: message.content || '*No text content*', inline: false },
                { name: '⏰ Time', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: true },
                { name: '🤖 Auto-Reply', value: '✅ Sent generic response with ServerMate invite', inline: true }
            )
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'ServerMate DM Management System' })
            .setTimestamp();

        // Add attachments if any
        if (message.attachments.size > 0) {
            const attachmentList = message.attachments.map(att =>
                `[${att.name}](${att.url})`
            ).join('\n');

            logEmbed.addFields({
                name: '📎 Attachments',
                value: attachmentList,
                inline: false
            });
        }

        await logChannel.send({ embeds: [logEmbed] });
        console.log(`[DM-MGMT] 📝 Logged DM to ServerMate channel: #${logChannel.name}`);

    } catch (error) {
        console.error(`[DM-MGMT] Error logging DM to ServerMate:`, error);
    }
}

