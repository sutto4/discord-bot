const { Events } = require('discord.js');
const { pool } = require('../config/database-multi-guild');

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Only process DMs (not guild messages)
        if (!message.guild && message.author.id !== message.client.user.id) {
            console.log(`[DM-REPLY] Processing DM: "${message.content}" from ${message.author.tag} (${message.author.id})`);
            try {

                // Get all guilds the bot is in (we'll check membership later)
                const userGuilds = message.client.guilds.cache;

                console.log(`[DM-REPLY] Bot is in ${userGuilds.size} guilds`);

                if (userGuilds.size === 0) return;

                                // Forward DM to each guild's configured channel
                for (const [guildId, guild] of userGuilds) {
                    try {
                        console.log(`[DM-REPLY] Checking guild: ${guild.name} (${guildId})`);

                        // Check if the DM sender is actually a member of this guild
                        let isMember = false;
                        try {
                            const member = await guild.members.fetch(message.author.id);
                            isMember = !!member;
                            console.log(`[DM-REPLY] User ${message.author.tag} is ${isMember ? '' : 'not '}a member of ${guild.name}`);
                        } catch (error) {
                            console.log(`[DM-REPLY] User ${message.author.tag} is not a member of ${guild.name} (fetch failed)`);
                        }

                        if (!isMember) {
                            console.log(`[DM-REPLY] Skipping ${guild.name} - user is not a member`);
                            continue;
                        }

                        // Get DM reply settings for this guild
                        const [settings] = await pool.execute(
                            'SELECT channel_id, enabled FROM dm_reply_settings WHERE guild_id = ? AND enabled = TRUE',
                            [guildId]
                        );

                        console.log(`[DM-REPLY] Guild ${guildId} (${guild.name}) settings query result:`, settings);
                        console.log(`[DM-REPLY] Settings array length:`, settings ? settings.length : 'null');

                        // settings is an array from pool.execute, check if it's empty or first row has no channel_id
                        if (!settings || settings.length === 0) {
                            console.log(`[DM-REPLY] No settings found for guild ${guildId} (${guild.name}) - skipping`);
                            continue;
                        }

                        const setting = settings[0]; // Get the first row
                        console.log(`[DM-REPLY] Retrieved setting for ${guild.name}:`, {
                            guild_id: guildId,
                            channel_id: setting.channel_id,
                            enabled: setting.enabled,
                            channel_exists: !!setting.channel_id
                        });

                        if (!setting.channel_id) {
                            console.log(`[DM-REPLY] No channel_id found for guild ${guildId} (${guild.name}) - skipping`);
                            continue;
                        }

                        console.log(`[DM-REPLY] ✅ Valid settings found for ${guild.name}: forwarding to channel ${setting.channel_id}`);

                        const targetChannel = await message.client.channels.fetch(setting.channel_id);

                        if (!targetChannel) {
                            console.error(`[DM-REPLY] Could not find channel ${setting.channel_id} in guild ${guildId}`);
                            continue;
                        }

                        console.log(`[DM-REPLY] Found target channel: ${targetChannel.name} in ${guild.name}`);

                        // Create embed with guild context
                        const embed = {
                            color: 0x0099ff,
                            title: `💬 DM Forwarded to ${guild.name}`,
                            description: `*This DM was sent to the bot and is being forwarded because you're a member of this server.*`,
                            fields: [
                                {
                                    name: '👤 From User',
                                    value: `${message.author.tag} (${message.author.id})`,
                                    inline: true
                                },
                                {
                                    name: '🏠 Forwarded To',
                                    value: `${guild.name} (${guildId})`,
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
                            footer: {
                                text: 'DM Reply Forwarding System',
                                icon_url: message.client.user.displayAvatarURL({ dynamic: true })
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
                        console.log(`[DM-REPLY] ✅ Successfully forwarded DM to ${targetChannel.name} in ${guild.name}`);

                    } catch (error) {
                        console.error(`[DM-REPLY] ❌ Error forwarding DM to guild ${guildId} (${guild.name}):`, error.message);
                    }
                }

                console.log(`[DM-REPLY] Completed processing DM from ${message.author.tag} across all guilds`);

            } catch (error) {
                console.error(`[DM-REPLY] Fatal error processing DM from ${message.author.tag}:`, error);
            }
        }
    },
};

