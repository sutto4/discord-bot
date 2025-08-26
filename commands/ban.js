const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Ban a user from the server')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to ban')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('duration')
				.setDescription('Duration of ban (e.g., 30d, 2w, 1mo) or leave empty for permanent')
				.setRequired(false))
		.addIntegerOption(option => 
			option.setName('delete_days')
				.setDescription('Number of days of messages to delete (0-7)')
				.setMinValue(0)
				.setMaxValue(7)
				.setRequired(false))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the ban')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const duration = interaction.options.getString('duration');
		const deleteDays = interaction.options.getInteger('delete_days') || 0;
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Check if user can be banned
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.bannable) {
				return interaction.reply({ 
					content: '❌ I cannot ban this user. They may have higher permissions than me.', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Parse duration if provided
			let durationMs = null;
			let durationLabel = null;
			if (duration) {
				const parsed = parseDuration(duration);
				if (parsed) {
					durationMs = parsed.ms;
					durationLabel = parsed.label;
				}
			}

			// Ban the user
			await interaction.guild.members.ban(user, { 
				deleteMessageDays: deleteDays,
				reason: `${reason} - Moderator: ${interaction.user.tag}`
			});

			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'ban',
				interaction.user,
				member,
				reason,
				durationLabel
			);
			
			// TODO: Database logging will be added later
			console.log('Moderation action logged:', {
				guildId: interaction.guildId,
				caseId,
				actionType: 'ban',
				targetUserId: user.id,
				targetUsername: user.tag,
				moderatorUserId: interaction.user.id,
				moderatorUsername: interaction.user.tag,
				reason,
				durationMs,
				durationLabel,
				active: true,
				expiresAt: durationMs ? new Date(Date.now() + durationMs) : null
			});

			// Try to DM the banned user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#FF0000')
					.setTitle('🔨 You have been banned')
					.setDescription(`You have been banned from **${interaction.guild.name}**`)
					.addFields(
						{ name: 'Reason', value: reason, inline: false },
						{ name: 'Moderator', value: interaction.user.tag, inline: true }
					)
					.setThumbnail(user.displayAvatarURL())
					.setTimestamp();

				if (durationLabel) {
					dmEmbed.addFields({ name: 'Duration', value: durationLabel, inline: true });
				}

				await user.send({ embeds: [dmEmbed] });
			} catch (dmError) {
				// User has DMs disabled, ignore
			}

			// Send ephemeral reply to the command user (only they can see it)
			const replyEmbed = new EmbedBuilder()
				.setColor('#FF0000')
				.setTitle('✅ User Banned')
				.setDescription(`**${user.tag}** has been banned`)
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Case ID', value: caseId, inline: true }
				)
				.setTimestamp();

			if (durationLabel) {
				replyEmbed.addFields({ name: 'Duration', value: durationLabel, inline: true });
			}

			await interaction.reply({ 
				embeds: [replyEmbed], 
				flags: MessageFlags.Ephemeral
			});



		} catch (error) {
			console.error('Error banning user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to ban the user.', 
				flags: MessageFlags.Ephemeral
			});
		}
	},
};

// Helper functions
function parseDuration(duration) {
	const regex = /^(\d+)([smhdwmo])$/;
	const match = duration.toLowerCase().match(regex);
	
	if (!match) return null;
	
	const value = parseInt(match[1]);
	const unit = match[2];
	
	let ms = 0;
	switch (unit) {
		case 's': ms = value * 1000; break;
		case 'm': ms = value * 60 * 1000; break;
		case 'h': ms = value * 60 * 60 * 1000; break;
		case 'd': ms = value * 24 * 60 * 60 * 1000; break;
		case 'w': ms = value * 7 * 24 * 60 * 60 * 1000; break;
		case 'o': ms = value * 30 * 24 * 60 * 60 * 1000; break; // month
		default: return null;
	}
	
	return { ms, label: duration };
}

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
