const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('case')
		.setDescription('View moderation case details')
		.addStringOption(option => 
			option.setName('case_id')
				.setDescription('The case ID to view')
				.setRequired(true)),

	async execute(interaction) {
		const caseId = interaction.options.getString('case_id');

		try {
			// Get case details from database
			const caseData = await getCaseDetails(interaction.guildId, caseId);
			
			if (!caseData) {
				return interaction.reply({ 
					content: '❌ Case not found.', 
					flags: MessageFlags.Ephemeral
				});
			}

			// Create embed
			const embed = new EmbedBuilder()
				.setColor(getActionColor(caseData.action_type))
				.setTitle(`📋 Case ${caseData.case_id}`)
				.addFields(
					{ name: 'Action', value: caseData.action_type.toUpperCase(), inline: true },
					{ name: 'Target User', value: caseData.target_username, inline: true },
					{ name: 'Moderator', value: caseData.moderator_username, inline: true },
					{ name: 'Reason', value: caseData.reason || 'No reason provided', inline: false },
					{ name: 'Status', value: caseData.active ? '🟢 Active' : '🔴 Inactive', inline: true },
					{ name: 'Created', value: `<t:${Math.floor(new Date(caseData.created_at).getTime() / 1000)}:R>`, inline: true }
				)
				.setTimestamp();

			if (caseData.duration_label) {
				embed.addFields({ name: 'Duration', value: caseData.duration_label, inline: true });
			}

			if (caseData.expires_at) {
				embed.addFields({ name: 'Expires', value: `<t:${Math.floor(new Date(caseData.expires_at).getTime() / 1000)}:R>`, inline: true });
			}

			await interaction.reply({ 
				embeds: [embed], 
				flags: MessageFlags.Ephemeral
			});

		} catch (error) {
			console.error('Error fetching case:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while fetching the case.', 
				flags: MessageFlags.Ephemeral
			});
		}
	},
};

function getActionColor(actionType) {
	const colors = {
		'ban': '#FF0000',
		'unban': '#00FF00',
		'mute': '#FFA500',
		'unmute': '#0000FF',
		'kick': '#FF8C00',
		'warn': '#FFD700'
	};
	return colors[actionType] || '#808080';
}

async function getCaseDetails(guildId, caseId) {
	try {
		const ModerationDatabase = require('../utils/moderation-db');
		const modDb = new ModerationDatabase();

		const caseData = await modDb.getCaseDetails(guildId, caseId);

		if (!caseData) {
			return null;
		}

		// Convert database format to display format
		return {
			case_id: caseData.case_id,
			action_type: caseData.action_type,
			target_username: caseData.target_username,
			target_user_id: caseData.target_user_id,
			moderator_username: caseData.moderator_username,
			moderator_user_id: caseData.moderator_user_id,
			reason: caseData.reason,
			duration_label: caseData.duration_label,
			active: caseData.active === 1,
			expires_at: caseData.expires_at,
			created_at: caseData.created_at
		};
	} catch (error) {
		console.error('Error fetching case details:', error);
		return null;
	}
}
