const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('moderation')
		.setDescription('Manage moderation system settings')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand => 
			subcommand.setName('status')
				.setDescription('View moderation system status'))
		.addSubcommand(subcommand => 
			subcommand.setName('enable')
				.setDescription('Enable a moderation command')
				.addStringOption(option => 
					option.setName('command')
						.setDescription('The command to enable')
						.setRequired(true)
						.addChoices(
							{ name: 'Ban', value: 'ban' },
							{ name: 'Unban', value: 'unban' },
							{ name: 'Mute', value: 'mute' },
							{ name: 'Unmute', value: 'unmute' },
							{ name: 'Kick', value: 'kick' },
							{ name: 'Warn', value: 'warn' },
							{ name: 'Case', value: 'case' }
						)))
		.addSubcommand(subcommand => 
			subcommand.setName('disable')
				.setDescription('Disable a moderation command')
				.addStringOption(option => 
					option.setName('command')
						.setDescription('The command to disable')
						.setRequired(true)
						.addChoices(
							{ name: 'Ban', value: 'ban' },
							{ name: 'Unban', value: 'unban' },
							{ name: 'Mute', value: 'mute' },
							{ name: 'Unmute', value: 'unmute' },
							{ name: 'Kick', value: 'kick' },
							{ name: 'Warn', value: 'warn' },
							{ name: 'Case', value: 'case' }
						)))
		.addSubcommand(subcommand => 
			subcommand.setName('reset')
				.setDescription('Reset all moderation commands to default (enabled)')),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		await interaction.deferReply({ ephemeral: true });

		try {
			switch (subcommand) {
				case 'status':
					await showStatus(interaction);
					break;
				case 'enable':
					await enableCommand(interaction);
					break;
				case 'disable':
					await disableCommand(interaction);
					break;
				case 'reset':
					await resetCommands(interaction);
					break;
				default:
					await interaction.editReply({ content: '❌ Unknown subcommand.' });
			}
		} catch (error) {
			console.error('Error in moderation command:', error);
			await interaction.editReply({ content: '❌ An error occurred while processing the command.' });
		}
	},
};

async function showStatus(interaction) {
	try {
		// Get moderation system status from database
		const status = await getModerationStatus(interaction.guildId);
		
		const embed = new EmbedBuilder()
			.setColor('#00FF00')
			.setTitle('🛡️ Moderation System Status')
			.setDescription(`**Guild:** ${interaction.guild.name}`)
			.addFields(
				{ name: 'System Status', value: status.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
				{ name: 'Log Channel', value: status.logChannel ? `<#${status.logChannel}>` : 'Not set', inline: true },
				{ name: 'Ban Sync', value: status.banSync ? '🟢 Enabled' : '🔴 Disabled', inline: true }
			)
			.setTimestamp();

		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		await interaction.editReply({ content: '❌ Failed to get moderation status.' });
	}
}

async function enableCommand(interaction) {
	const command = interaction.options.getString('command');
	
	try {
		await setCommandStatus(interaction.guildId, command, true);
		await interaction.editReply({ content: `✅ **${command}** command has been enabled.` });
	} catch (error) {
		await interaction.editReply({ content: `❌ Failed to enable **${command}** command.` });
	}
}

async function disableCommand(interaction) {
	const command = interaction.options.getString('command');
	
	try {
		await setCommandStatus(interaction.guildId, command, false);
		await interaction.editReply({ content: `❌ **${command}** command has been disabled.` });
	} catch (error) {
		await interaction.editReply({ content: `❌ Failed to disable **${command}** command.` });
	}
}

async function resetCommands(interaction) {
	try {
		await resetAllCommands(interaction.guildId);
		await interaction.editReply({ content: '🔄 All moderation commands have been reset to default (enabled).' });
	} catch (error) {
		await interaction.editReply({ content: '❌ Failed to reset commands.' });
	}
}

// Helper functions - these will be implemented with database integration
async function getModerationStatus(guildId) {
	// TODO: Implement database query
	return {
		enabled: true,
		logChannel: null,
		banSync: false
	};
}

async function setCommandStatus(guildId, command, enabled) {
	// TODO: Implement database update
	console.log(`Setting ${command} to ${enabled} for guild ${guildId}`);
}

async function resetAllCommands(guildId) {
	// TODO: Implement database reset
	console.log(`Resetting all commands for guild ${guildId}`);
}
