const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

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
			// Fetch the member object for logging
			const member = await interaction.guild.members.fetch(user.id);
			
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

			// Try to DM the warned user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#FFD700')
					.setTitle('⚠️ You have been warned')
					.setDescription(`You have been warned in **${interaction.guild.name}**`)
					.addFields(
						{ name: 'Reason', value: reason, inline: false },
						{ name: 'Moderator', value: interaction.user.tag, inline: true },
						{ name: 'Case ID', value: caseId, inline: true }
					)
					.setThumbnail(user.displayAvatarURL())
					.setTimestamp();

				await user.send({ embeds: [dmEmbed] });
			} catch (dmError) {
				// User has DMs disabled, ignore
			}

			// Send ephemeral reply to the command user (only they can see it)
			const replyEmbed = new EmbedBuilder()
				.setColor('#FFD700')
				.setTitle('✅ Warning Sent')
				.setDescription(`**${user.tag}** has been warned`)
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Case ID', value: caseId, inline: true }
				)
				.setTimestamp();

			await interaction.reply({ 
				embeds: [replyEmbed], 
				flags: MessageFlags.Ephemeral
			});

		} catch (error) {
			console.error('Error warning user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to warn the user.', 
				flags: MessageFlags.Ephemeral
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
