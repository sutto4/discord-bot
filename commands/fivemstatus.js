const { SlashCommandBuilder } = require('discord.js');
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
                const max = info?.sv_maxclients || info?.vars?.sv_maxclients || count;
                const version = info?.version || 'Unknown';

                await interaction.reply({
                        content: `**${name}**\nStatus: Online\nPlayers: ${count}/${max}\nVersion: ${version}`,
                        flags: 64
                });
        },
};