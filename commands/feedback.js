const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('feedback')
		.setDescription('Submit feedback, suggestions, or bug reports')
		.setDMPermission(false),

	async execute(interaction) {
		// Create feedback modal
		const modal = new ModalBuilder()
			.setCustomId('feedback_modal')
			.setTitle('Submit Feedback');

		// Feedback type input
		const feedbackTypeInput = new TextInputBuilder()
			.setCustomId('feedback_type')
			.setLabel('Feedback Type')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('e.g., Bug Report, Suggestion, Compliment, etc.')
			.setRequired(true)
			.setMaxLength(50);

		// Subject input
		const subjectInput = new TextInputBuilder()
			.setCustomId('feedback_subject')
			.setLabel('Subject')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('Brief description of your feedback')
			.setRequired(true)
			.setMaxLength(100);

		// Detailed feedback input
		const detailsInput = new TextInputBuilder()
			.setCustomId('feedback_details')
			.setLabel('Detailed Feedback')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('Please provide detailed information about your feedback...')
			.setRequired(true)
			.setMaxLength(1000);

		// Contact info input (optional)
		const contactInput = new TextInputBuilder()
			.setCustomId('feedback_contact')
			.setLabel('Contact Info (Optional)')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('How can we reach you? (Discord, Email, etc.)')
			.setRequired(false)
			.setMaxLength(100);

		// Priority/Urgency input (NEW: using 5th action row)
		const priorityInput = new TextInputBuilder()
			.setCustomId('feedback_priority')
			.setLabel('Priority (Low/Medium/High)')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('Low, Medium, or High')
			.setRequired(false)
			.setMaxLength(20);

		// Add inputs to action rows (now using all 5 rows!)
		const firstActionRow = new ActionRowBuilder().addComponents(feedbackTypeInput);
		const secondActionRow = new ActionRowBuilder().addComponents(subjectInput);
		const thirdActionRow = new ActionRowBuilder().addComponents(detailsInput);
		const fourthActionRow = new ActionRowBuilder().addComponents(contactInput);
		const fifthActionRow = new ActionRowBuilder().addComponents(priorityInput);

		// Add action rows to modal
		modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);

		// Show modal
		await interaction.showModal(modal);
	},
};
