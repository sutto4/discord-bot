const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unmute')
		.setDescription('Remove timeout from a user')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to unmute')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for removing the timeout')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Check if user can be moderated
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.moderatable) {
				return interaction.reply({ 
					content: '❌ I cannot unmute this user. They may have higher permissions than me.', 
					ephemeral: true 
				});
			}

			// Check if user is actually timed out
			if (!member.isCommunicationDisabled()) {
				return interaction.reply({ 
					content: '❌ This user is not currently timed out.', 
					ephemeral: true 
				});
			}

			// Remove the timeout
			await member.timeout(null, `${reason} - Moderator: ${interaction.user.tag}`);

			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'unmute',
				interaction.user,
				member,
				reason
			);
			
			// TODO: Database logging will be added later
			console.log('Moderation action logged:', {
				guildId: interaction.guildId,
				caseId,
				actionType: 'unmute',
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

			// Try to DM the unmuted user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#0000FF')
					.setTitle('🔊 Your timeout has been removed')
					.setDescription(`Your timeout in **${interaction.guild.name}** has been removed`)
					.addFields(
						{ name: 'Reason', value: reason, inline: false },
						{ name: 'Moderator', value: interaction.user.tag, inline: true }
					)
					.setThumbnail(user.displayAvatarURL())
					.setTimestamp();

				await user.send({ embeds: [dmEmbed] });
			} catch (dmError) {
				// User has DMs disabled, ignore
			}

			// Send ephemeral reply to the command user (only they can see it)
			const replyEmbed = new EmbedBuilder()
				.setColor('#0000FF')
				.setTitle('✅ User Unmuted')
				.setDescription(`**${user.tag}** has been unmuted`)
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
			console.error('Error unmuting user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to unmute the user.', 
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
