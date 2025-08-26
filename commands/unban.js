const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unban')
		.setDescription('Unban a user from the server')
		.addStringOption(option => 
			option.setName('user_id')
				.setDescription('The user ID to unban')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the unban')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

	async execute(interaction) {
		const userId = interaction.options.getString('user_id');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Check if user ID is valid
			if (!/^\d+$/.test(userId)) {
				return interaction.reply({ 
					content: '❌ Invalid user ID. Please provide a valid Discord user ID.', 
					ephemeral: true 
				});
			}

			// Get the user
			const user = await interaction.client.users.fetch(userId);
			if (!user) {
				return interaction.reply({ 
					content: '❌ User not found.', 
					ephemeral: true 
				});
			}

			// Check if user is actually banned
			const bans = await interaction.guild.bans.fetch();
			const bannedUser = bans.find(ban => ban.user.id === userId);
			
			if (!bannedUser) {
				return interaction.reply({ 
					content: '❌ This user is not banned.', 
					ephemeral: true 
				});
			}

			// Unban the user
			await interaction.guild.members.unban(user, `${reason} - Moderator: ${interaction.user.tag}`);

			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'unban',
				interaction.user,
				null, // No member object for unbans
				reason
			);
			
			// TODO: Database logging will be added later
			console.log('Moderation action logged:', {
				guildId: interaction.guildId,
				caseId,
				actionType: 'unban',
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

			// Try to DM the unbanned user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#00FF00')
					.setTitle('🔓 You have been unbanned')
					.setDescription(`You have been unbanned from **${interaction.guild.name}**`)
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
				.setColor('#00FF00')
				.setTitle('✅ User Unbanned')
				.setDescription(`**${user.tag}** has been unbanned`)
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
			console.error('Error unbanning user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to unban the user.', 
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
