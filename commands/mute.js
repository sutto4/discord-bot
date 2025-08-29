const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mute')
		.setDescription('Timeout a user temporarily')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to mute')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('duration')
				.setDescription('Duration of mute (e.g., 30s, 5m, 2h, 1d, 1w)')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the mute')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const duration = interaction.options.getString('duration');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Check if user can be moderated
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.moderatable) {
				return interaction.reply({ 
					content: '❌ I cannot mute this user. They may have higher permissions than me.', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Parse duration
			const parsed = parseDuration(duration);
			if (!parsed) {
				return interaction.reply({ 
					content: '❌ Invalid duration format. Use: 30s, 5m, 2h, 1d, 1w', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Check if duration is within Discord's limits (max 28 days)
			if (parsed.ms > 28 * 24 * 60 * 60 * 1000) {
				return interaction.reply({ 
					content: '❌ Duration cannot exceed 28 days.', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Timeout the user
			await member.timeout(parsed.ms, `${reason} - Moderator: ${interaction.user.tag}`);

			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'mute',
				interaction.user,
				member,
				reason,
				parsed.label
			);
			
			// Log to database
			const { logModerationAction } = require('../utils/databaseLogger');
			await logModerationAction({
				guildId: interaction.guildId,
				caseId,
				actionType: 'mute',
				targetUserId: user.id,
				targetUsername: user.tag,
				moderatorUserId: interaction.user.id,
				moderatorUsername: interaction.user.tag,
				reason,
				durationMs: parsed.ms,
				durationLabel: parsed.label,
				active: true,
				expiresAt: new Date(Date.now() + parsed.ms)
			});

			// Try to DM the muted user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#FFA500')
					.setTitle('🔇 You have been muted')
					.setDescription(`You have been muted in **${interaction.guild.name}**`)
					.addFields(
						{ name: 'Reason', value: reason, inline: false },
						{ name: 'Duration', value: parsed.label, inline: true },
						{ name: 'Moderator', value: interaction.user.tag, inline: true },
						{ name: 'Expires', value: `<t:${Math.floor((Date.now() + parsed.ms) / 1000)}:R>`, inline: true }
					)
					.setThumbnail(user.displayAvatarURL())
					.setTimestamp();

				await user.send({ embeds: [dmEmbed] });
			} catch (dmError) {
				// User has DMs disabled, ignore
			}

			// Send ephemeral reply to the command user (only they can see it)
			const replyEmbed = new EmbedBuilder()
				.setColor('#FFA500')
				.setTitle('✅ User Muted')
				.setDescription(`**${user.tag}** has been muted`)
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Duration', value: parsed.label, inline: true },
					{ name: 'Case ID', value: caseId, inline: true },
					{ name: 'Expires', value: `<t:${Math.floor((Date.now() + parsed.ms) / 1000)}:R>`, inline: true }
				)
				.setTimestamp();

			await interaction.reply({ 
				embeds: [replyEmbed], 
				flags: MessageFlags.Ephemeral
			});



		} catch (error) {
			console.error('Error muting user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to mute the user.', 
				flags: MessageFlags.Ephemeral
			});
		}
	},
};

// Helper functions
function parseDuration(duration) {
	const regex = /^(\d+)([smhdw])$/;
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
