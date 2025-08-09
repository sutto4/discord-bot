const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServer, fetchServerData } = require('../utils/fivem');

module.exports = {
        data: new SlashCommandBuilder()
                .setName('fivemstatus')
                .setDescription('Display status of the configured FiveM server'),
        async execute(interaction) {
                const address = await getServer(interaction.guild.id);
                if (!address) {
                        return interaction.reply({
                                content: '❌ No FiveM server configured. Use `/setfivemserver` first.',
                                flags: 64
                        });
                }

                const data = await fetchServerData(address);
                if (!data) {
                        return interaction.reply({
                                content: `❌ Unable to reach server \`${address}\`.`,
                                flags: 64
                        });
                }

                const { info, players } = data;
                const name = info?.hostname || info?.vars?.sv_projectName || info?.vars?.sv_hostname || 'Unknown';
                const count = Array.isArray(players) ? players.length : (info?.clients ?? 0);
                const max = info?.sv_maxClients || info?.vars?.sv_maxClients || count;
                const version = String(info?.version ?? 'Unknown');
                const map = String(info?.mapname ?? info?.vars?.mapname ?? 'Unknown');
                const gametype = String(info?.gametype ?? info?.vars?.gametype ?? 'Unknown');
                const uptime = String(info?.Uptime ?? 'Unknown');
                const reserved = String(info?.sv_reservedslots ?? 'Unknown');


                const embed = new EmbedBuilder()
                        .setTitle(name)
                        .setColor(0x2ecc71)
                        .addFields(
                                { name: 'Status', value: 'Online', inline: true },
                                { name: 'Players', value: `${count}/${max}`, inline: true },
                                { name: 'Reserved Slots', value: reserved, inline: true },
                                { name: 'Version', value: version, inline: true },
                                { name: 'Map', value: map, inline: true },
                                { name: 'Game Type', value: gametype, inline: true },
                                { name: 'Uptime', value: uptime, inline: true },
                                { name: 'Direct Connect', value: `fivem://connect/${address}`, inline: false }
                        )
                        .setTimestamp();

                await interaction.reply({
                        embeds: [embed],
                        flags: 64
                });
        },
};