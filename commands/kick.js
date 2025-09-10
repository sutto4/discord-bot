const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Kick a user from the server')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to kick')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the kick')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Check if user can be kicked
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.kickable) {
				return interaction.reply({ 
					content: '❌ I cannot kick this user. They may have higher permissions than me.', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Kick the user
			await member.kick(`${reason} - Moderator: ${interaction.user.tag}`);

			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'kick',
				interaction.user,
				member,
				reason,
				null, // no duration for kicks
				caseId
			);
			
			// Log to database
			const { logModerationAction } = require('../utils/databaseLogger');
			await logModerationAction({
				guildId: interaction.guildId,
				caseId,
				actionType: 'kick',
				targetUserId: user.id,
				targetUsername: user.tag,
				moderatorUserId: interaction.user.id,
				moderatorUsername: interaction.user.tag,
				reason,
				durationMs: null,
				durationLabel: null,
				active: false, // Kicks are immediate, not ongoing
				expiresAt: null
			});

			// Try to DM the kicked user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#FF8C00')
					.setTitle('👢 You have been kicked')
					.setDescription(`You have been kicked from **${interaction.guild.name}**`)
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
				.setColor('#FF8C00')
				.setTitle('✅ User Kicked')
				.setDescription(`**${user.tag}** has been kicked`)
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
			console.error('Error kicking user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to kick the user.', 
				flags: MessageFlags.Ephemeral
			});
		}
	},
};

// Helper functions
async function generateCaseId(guildId) {
	// Simple case ID generation - you can enhance this
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 1000);
	return `${guildId}-${timestamp}-${random}`;
}

async function logModerationAction(data) {
	// This will be implemented to log to your database
	// For now, just log to console
	console.log('Moderation action logged:', data);
	
	// TODO: Implement database logging
	// const { GuildDatabase } = require('../config/database-multi-guild');
	// await GuildDatabase.logModerationAction(data);
}
