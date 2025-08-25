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

			// Log to database
			await logModerationAction({
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

			// Create embed
			const embed = new EmbedBuilder()
				.setColor('#00FF00')
				.setTitle('🔓 User Unbanned')
				.setDescription(`**User:** ${user.tag} (${user.id})`)
				.setThumbnail(user.displayAvatarURL())
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Moderator', value: interaction.user.tag, inline: true },
					{ name: 'Case ID', value: caseId, inline: true }
				)
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });

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
