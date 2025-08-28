const { Events } = require('discord.js');
const { pool } = require('../config/database-multi-guild');

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Log all messages for debugging
        console.log(`[DM-REPLY] Message received: ${message.content} from ${message.author.tag} in ${message.guild ? message.guild.name : 'DM'}`);

        // Only process DMs (not guild messages)
        if (!message.guild && message.author.id !== message.client.user.id) {
            try {
                console.log(`[DM-REPLY] Processing DM from ${message.author.tag} (${message.author.id})`);

                // Get all guilds the bot is in (we'll check membership later)
                const userGuilds = message.client.guilds.cache;

                console.log(`[DM-REPLY] Bot is in ${userGuilds.size} guilds`);

                if (userGuilds.size === 0) return;

                // Forward DM to each guild's configured channel
                for (const [guildId, guild] of userGuilds) {
                    try {
                        console.log(`[DM-REPLY] Checking guild: ${guild.name} (${guildId})`);

                        // Get DM reply settings for this guild
                        const [settings] = await pool.execute(
                            'SELECT channel_id, enabled FROM dm_reply_settings WHERE guild_id = ? AND enabled = TRUE',
                            [guildId]
                        );

                        console.log(`[DM-REPLY] Guild ${guildId} settings:`, settings);

                        if (!settings || !settings.channel_id) {
                            console.log(`[DM-REPLY] No settings found for guild ${guildId}, skipping`);
                            continue;
                        }

                        console.log(`[DM-REPLY] Found settings for guild ${guildId}: channel=${settings.channel_id}, enabled=${settings.enabled}`);

                        const targetChannel = await message.client.channels.fetch(settings.channel_id);

                        if (!targetChannel) {
                            console.error(`[DM-REPLY] Could not find channel ${settings.channel_id} in guild ${guildId}`);
                            continue;
                        }

                        console.log(`[DM-REPLY] Found target channel: ${targetChannel.name} in ${guild.name}`);

                        // Create embed with guild context
                        const embed = {
                            color: 0x0099ff,
                            title: `💬 DM from ${guild.name} Member`,
                            fields: [
                                {
                                    name: '👤 From User',
                                    value: `${message.author.tag} (${message.author.id})`,
                                    inline: true
                                },
                                {
                                    name: '🏠 Guild',
                                    value: guild.name,
                                    inline: true
                                },
                                {
                                    name: '📅 Time',
                                    value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
                                    inline: true
                                },
                                {
                                    name: '💬 Message',
                                    value: message.content || '*No text content*',
                                    inline: false
                                }
                            ],
                            thumbnail: {
                                url: message.author.displayAvatarURL({ dynamic: true })
                            },
                            timestamp: new Date().toISOString()
                        };

                        // Add attachments if any
                        if (message.attachments.size > 0) {
                            const attachmentList = message.attachments.map(att => 
                                `[${att.name}](${att.url})`
                            ).join('\n');
                            
                            embed.fields.push({
                                name: '📎 Attachments',
                                value: attachmentList,
                                inline: false
                            });
                        }

                        console.log(`[DM-REPLY] Sending embed to ${targetChannel.name} in ${guild.name}`);
                        await targetChannel.send({ embeds: [embed] });
                        console.log(`[DM-REPLY] Successfully sent DM to ${targetChannel.name} in ${guild.name}`);

                    } catch (error) {
                        console.error(`[DM-REPLY] Error forwarding DM to guild ${guildId}:`, error);
                    }
                }

            } catch (error) {
                console.error('Error processing DM reply:', error);
            }
        }
    },
};

