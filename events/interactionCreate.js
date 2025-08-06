const { Events } = require('discord.js');
const { verifyRoleId } = require('../config/roles');
const { logToChannel } = require('../helpers/logger');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isButton() && interaction.customId === 'verify_button') {
			let success = false;

			try {
				await interaction.member.roles.add(verifyRoleId);
				await interaction.reply({
					content: '✅ You have been verified!',
					flags: 64
				});
				success = true;
			} catch (err) {
				console.error('Failed to assign verify role:', err);
				await interaction.reply({
					content: '❌ Could not verify you.',
					flags: 64
				});
			}

			// 🔁 Log the result to the configured log channel
			await logToChannel(
				interaction.guild,
				`<@${interaction.user.id}> tried to verify: **${success ? 'Success' : 'Failed'}**`
			);
		}

		// Slash command handler
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) return;

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				await interaction.reply({ content: '❌ Command failed.', flags: 64 });
			}
		}
	}
};