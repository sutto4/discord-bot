const { SlashCommandBuilder } = require('discord.js');
const { getServer, fetchServerData } = require('../utils/fivem');

module.exports = {
        data: new SlashCommandBuilder()
                .setName('fivemplayers')
                .setDescription('Show player count or list from the configured FiveM server')
                .addBooleanOption(option =>
                        option.setName('list')
                                .setDescription('Show a full list of player names')), 
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

                const players = data.players || [];
                const showList = interaction.options.getBoolean('list');
                if (showList) {
                        const names = players.map(p => p.name).join(', ') || 'No players online.';
                        return interaction.reply({
                                content: `Players (${players.length}): ${names}`,
                                flags: 64
                        });
                }

                await interaction.reply({
                        content: `Players online: ${players.length}`,
                        flags: 64
                });
        },
};
