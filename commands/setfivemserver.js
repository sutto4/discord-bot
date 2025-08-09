const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setServer } = require('../utils/fivem');

module.exports = {
        data: new SlashCommandBuilder()
                .setName('setfivemserver')
                .setDescription('Set the FiveM server address or CFX code to monitor')
                .addStringOption(option =>
                        option.setName('address')
                                .setDescription('IP:port or CFX join code')
                                .setRequired(true))
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        async execute(interaction) {
                const address = interaction.options.getString('address', true);
                try {
                        await setServer(interaction.guild.id, address);
                        await interaction.reply({
                                content: `✅ FiveM server set to \`${address}\``,
                                flags: 64
                        });
                } catch (error) {
                        console.error('Error setting FiveM server:', error);
                        await interaction.reply({
                                content: '❌ Failed to save server address.',
                                flags: 64
                        });
                }
        },
};