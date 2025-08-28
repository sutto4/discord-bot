const { Events } = require('discord.js');
const { query } = require('../config/database');

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Only process DMs (not guild messages)
        if (!message.guild && message.author.id !== message.client.user.id) {
            try {
                // Get all guilds where this user is a member
                const userGuilds = message.client.guilds.cache.filter(guild => 
                    guild.members.cache.has(message.author.id)
                );

                if (userGuilds.size === 0) return;

                // Forward DM to each guild's configured channel
                for (const [guildId, guild] of userGuilds) {
                    try {
                        // Get DM reply settings for this guild
                        const [settings] = await query(
                            'SELECT channel_id, enabled FROM dm_reply_settings WHERE guild_id = ? AND enabled = TRUE',
                            [guildId]
                        );

                        if (!settings || !settings.channel_id) continue;

                        const targetChannel = await message.client.channels.fetch(settings.channel_id);
                        
                        if (!targetChannel) {
                            console.error(`Could not find channel ${settings.channel_id} in guild ${guildId}`);
                            continue;
                        }

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

                        await targetChannel.send({ embeds: [embed] });

                    } catch (error) {
                        console.error(`Error forwarding DM to guild ${guildId}:`, error);
                    }
                }

            } catch (error) {
                console.error('Error processing DM reply:', error);
            }
        }
    },
};

