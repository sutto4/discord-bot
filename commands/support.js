const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('support')
		.setDescription('Submit feedback, bug reports, or support requests')
		.setDMPermission(false),

	async execute(interaction) {
		// Create feedback modal
		const modal = new ModalBuilder()
			.setCustomId('feedback_modal')
			.setTitle('Submit Feedback & Support Request');

		// Feedback type input
		const feedbackTypeInput = new TextInputBuilder()
			.setCustomId('feedback_type')
			.setLabel('Type')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('e.g., Bug Report, Suggestion, Support Request, etc.')
			.setRequired(true)
			.setMaxLength(50);

		// Subject input
		const subjectInput = new TextInputBuilder()
			.setCustomId('feedback_subject')
			.setLabel('Subject')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('Brief description of your issue/feedback')
			.setRequired(true)
			.setMaxLength(100);

		// Detailed feedback input
		const detailsInput = new TextInputBuilder()
			.setCustomId('feedback_details')
			.setLabel('Details')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('Please provide detailed information about your issue, feedback, or request...')
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

		// Add inputs to action rows
		const firstActionRow = new ActionRowBuilder().addComponents(feedbackTypeInput);
		const secondActionRow = new ActionRowBuilder().addComponents(subjectInput);
		const thirdActionRow = new ActionRowBuilder().addComponents(detailsInput);
		const fourthActionRow = new ActionRowBuilder().addComponents(contactInput);

		// Add action rows to modal
		modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

		// Show modal
		await interaction.showModal(modal);
	},
};
