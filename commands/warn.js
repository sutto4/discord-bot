const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a user (no action taken)')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to warn')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the warning')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'warn',
				interaction.user,
				member,
				reason
			);
			
			// TODO: Database logging will be added later
			console.log('Moderation action logged:', {
				guildId: interaction.guildId,
				caseId,
				actionType: 'warn',
				targetUserId: user.id,
				targetUsername: user.tag,
				moderatorUserId: interaction.user.id,
				moderatorUsername: interaction.user.tag,
				reason,
				durationMs: null,
				durationLabel: null,
				active: false,
				expiresAt: null
			});

			// Create embed
			const embed = new EmbedBuilder()
				.setColor('#FFD700')
				.setTitle('⚠️ User Warned')
				.setDescription(`**User:** ${user.tag} (${user.id})`)
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Moderator', value: interaction.user.tag, inline: true },
					{ name: 'Case ID', value: caseId, inline: true }
				)
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });

		} catch (error) {
			console.error('Error warning user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to warn the user.', 
				ephemeral: true 
			});
		}
	},
};

async function generateCaseId(guildId) {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 1000);
	return `${guildId}-${timestamp}-${random}`;
}

async function logModerationAction(data) {
	console.log('Moderation action logged:', data);
}
