const { SlashCommandBuilder } = require('discord.js');
const { getServer, fetchServerData } = require('../utils/fivem');

module.exports = {
        data: new SlashCommandBuilder()
                .setName('findfivemplayer')
                .setDescription('Find a player by name on the configured FiveM server')
                .addStringOption(option =>
                        option.setName('name')
                                .setDescription('Name or partial name to search for')
                                .setRequired(true)),
        async execute(interaction) {
                const address = getServer(interaction.guild.id);
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

                const query = interaction.options.getString('name', true).toLowerCase();
                const player = (data.players || []).find(p => p.name.toLowerCase().includes(query));

                if (!player) {
                        return interaction.reply({
                                content: `❌ No player found matching \`${query}\`.`,
                                flags: 64
                        });
                }

                const identifiers = (player.identifiers || []).slice(0, 3).join('\n');
                const extra = identifiers ? `\nIdentifiers:\n${identifiers}` : '';
                await interaction.reply({
                        content: `**${player.name}**\nID: ${player.id}\nPing: ${player.ping}${extra}`,
                        flags: 64
                });
        },
};
