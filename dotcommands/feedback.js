const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
	name: 'feedback',
	description: 'Submit feedback about the server',
	
	async execute(message, args) {
		try {
			// Create feedback modal
			const modal = new ModalBuilder()
				.setCustomId('feedback_modal')
				.setTitle('Submit Feedback - Fat Duck Gaming');

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

			// Add inputs to action rows
			const firstActionRow = new ActionRowBuilder().addComponents(feedbackTypeInput);
			const secondActionRow = new ActionRowBuilder().addComponents(subjectInput);
			const thirdActionRow = new ActionRowBuilder().addComponents(detailsInput);
			const fourthActionRow = new ActionRowBuilder().addComponents(contactInput);

			// Add action rows to modal
			modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

			// Show modal to user
			await message.reply({ 
				content: '📝 Opening feedback form...', 
				flags: 64 
			});

			// We need to create an interaction to show the modal
			// Since this is a message command, we'll create a button that opens the modal
			const feedbackButton = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('open_feedback_modal')
						.setLabel('📝 Submit Feedback')
						.setStyle(ButtonStyle.Primary)
				);

			const embed = new EmbedBuilder()
				.setTitle('📝 Submit Feedback')
				.setDescription('Help us improve Fat Duck Gaming by sharing your thoughts, suggestions, or reporting issues.')
				.setColor(0x5865F2)
				.addFields(
					{
						name: '💡 What can you submit?',
						value: '• Bug reports\n• Feature suggestions\n• Server improvements\n• Compliments or complaints\n• General feedback',
						inline: false
					},
					{
						name: '🔒 Privacy',
						value: 'Your feedback will be reviewed by staff members only.',
						inline: false
					},
					{
						name: '⚙️ For Administrators',
						value: 'Use `/setfeedbackchannel` to configure where feedback submissions are sent.',
						inline: false
					}
				)
				.setFooter({ text: 'Click the button below to open the feedback form' })
				.setTimestamp();

			await message.reply({ 
				embeds: [embed],
				components: [feedbackButton]
			});

		} catch (error) {
			console.error('Error in feedback dot command:', error);
			await message.reply('❌ An error occurred while displaying the feedback form.');
		}
	}
};
