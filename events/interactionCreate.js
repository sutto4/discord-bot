const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } = require('discord.js');
const { verifyRoleId } = require('../config/roles');
const { logToChannel } = require('../helpers/logger');
const { logFeedbackToChannel } = require('../helpers/feedbackLogger');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// Handle verify button
		if (interaction.isButton() && interaction.customId === 'verify_button') {
			let success = false;

			try {
				await interaction.member.roles.add(verifyRoleId);
				await interaction.reply({
					content: '✅ You have been verified!',
					flags: 64
				});
				success = true;
			} catch (err) {
				console.error('Failed to assign verify role:', err);
				await interaction.reply({
					content: '❌ Could not verify you.',
					flags: 64
				});
			}

			// 🔁 Log the result to the configured log channel
			await logToChannel(
				interaction.guild,
				`<@${interaction.user.id}> tried to verify: **${success ? 'Success' : 'Failed'}**`
			);
		}

		// Handle feedback button
		if (interaction.isButton() && interaction.customId === 'open_feedback_modal') {
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

			// Show modal
			await interaction.showModal(modal);
		}

		// Handle feedback modal submission
		if (interaction.isModalSubmit() && interaction.customId === 'feedback_modal') {
			const feedbackType = interaction.fields.getTextInputValue('feedback_type');
			const subject = interaction.fields.getTextInputValue('feedback_subject');
			const details = interaction.fields.getTextInputValue('feedback_details');
			const contact = interaction.fields.getTextInputValue('feedback_contact') || 'Not provided';

			// Create feedback embed for staff
			const feedbackEmbed = new EmbedBuilder()
				.setTitle('📝 New Feedback Received')
				.setColor(0x5865F2)
				.addFields(
					{ name: '👤 User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
					{ name: '📋 Type', value: feedbackType, inline: true },
					{ name: '📌 Subject', value: subject, inline: false },
					{ name: '📝 Details', value: details, inline: false },
					{ name: '📞 Contact', value: contact, inline: true },
					{ name: '📅 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
				)
				.setThumbnail(interaction.user.displayAvatarURL())
				.setTimestamp();

			try {
				// Log feedback to configured feedback channel
				const feedbackSent = await logFeedbackToChannel(
					interaction.guild,
					`📝 **New Feedback Submitted**`,
					feedbackEmbed
				);

				if (feedbackSent) {
					// Acknowledge the user
					await interaction.reply({
						content: '✅ Thank you for your feedback! Your submission has been sent to our staff team.',
						ephemeral: true
					});
				} else {
					// Fallback to verification channel if no feedback channel is configured
					await logToChannel(
						interaction.guild,
						`📝 **New Feedback Submitted** (No feedback channel configured)`,
						feedbackEmbed
					);
					
					await interaction.reply({
						content: '✅ Thank you for your feedback! Your submission has been sent to our staff team.\n⚠️ *Note: Feedback channel not configured - sent to verification log.*',
						ephemeral: true
					});
				}
			} catch (error) {
				console.error('Error processing feedback:', error);
				await interaction.reply({
					content: '❌ There was an error submitting your feedback. Please try again later.',
					ephemeral: true
				});
			}
		}

		// Handle config button interactions
		if (interaction.isButton()) {
			if (interaction.customId === 'config_channels') {
				// Step 1: Ask which channel to configure first
				const embed = new EmbedBuilder()
					.setTitle('📝 Configure Channels - Step 1')
					.setDescription('Which channel would you like to configure first?')
					.setColor(0x5865F2)
					.addFields(
						{
							name: '📝 Verify Log Channel',
							value: 'Where verification activities will be logged',
							inline: false
						},
						{
							name: '💬 Feedback Channel',
							value: 'Where user feedback submissions will be sent',
							inline: false
						}
					)
					.setFooter({ text: 'Choose one to configure, then you can configure the other' });

				const channelTypeButtons = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId('configure_verify_log')
							.setLabel('📝 Configure Verify Log')
							.setStyle(ButtonStyle.Primary),
						new ButtonBuilder()
							.setCustomId('configure_feedback')
							.setLabel('💬 Configure Feedback')
							.setStyle(ButtonStyle.Secondary)
					);

				await interaction.reply({
					embeds: [embed],
					components: [channelTypeButtons],
					ephemeral: true
				});
			}

			if (interaction.customId === 'configure_verify_log') {
				// Show verify log channel selector
				const verifyLogSelect = new ChannelSelectMenuBuilder()
					.setCustomId('verify_log_select')
					.setPlaceholder('Select verify log channel')
					.addChannelTypes(ChannelType.GuildText);

				const selectRow = new ActionRowBuilder().addComponents(verifyLogSelect);

				const embed = new EmbedBuilder()
					.setTitle('📝 Select Verify Log Channel')
					.setDescription('Choose which channel should receive verification logs:')
					.setColor(0x5865F2)
					.setFooter({ text: 'Select a channel from the dropdown below' });

				await interaction.update({
					embeds: [embed],
					components: [selectRow]
				});
			}

			if (interaction.customId === 'configure_feedback') {
				// Show feedback channel selector
				const feedbackChannelSelect = new ChannelSelectMenuBuilder()
					.setCustomId('feedback_channel_select')
					.setPlaceholder('Select feedback channel')
					.addChannelTypes(ChannelType.GuildText);

				const selectRow = new ActionRowBuilder().addComponents(feedbackChannelSelect);

				const embed = new EmbedBuilder()
					.setTitle('💬 Select Feedback Channel')
					.setDescription('Choose which channel should receive feedback submissions:')
					.setColor(0x5865F2)
					.setFooter({ text: 'Select a channel from the dropdown below' });

				await interaction.update({
					embeds: [embed],
					components: [selectRow]
				});
			}

			if (interaction.customId === 'config_roles') {
				// Create roles configuration modal
				const modal = new ModalBuilder()
					.setCustomId('config_roles_modal')
					.setTitle('Configure Roles');

				const verifyRoleInput = new TextInputBuilder()
					.setCustomId('verify_role_id')
					.setLabel('Verify Role ID')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter role ID (e.g., 1234567890123456789)')
					.setRequired(false)
					.setMaxLength(20);

				const tier1RoleInput = new TextInputBuilder()
					.setCustomId('tier1_role_id')
					.setLabel('Tier 1 Donator Role ID')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter role ID (e.g., 1234567890123456789)')
					.setRequired(false)
					.setMaxLength(20);

				const tier2RoleInput = new TextInputBuilder()
					.setCustomId('tier2_role_id')
					.setLabel('Tier 2 Donator Role ID')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter role ID (e.g., 1234567890123456789)')
					.setRequired(false)
					.setMaxLength(20);

				const tier3RoleInput = new TextInputBuilder()
					.setCustomId('tier3_role_id')
					.setLabel('Tier 3 Donator Role ID')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter role ID (e.g., 1234567890123456789)')
					.setRequired(false)
					.setMaxLength(20);

				const firstRow = new ActionRowBuilder().addComponents(verifyRoleInput);
				const secondRow = new ActionRowBuilder().addComponents(tier1RoleInput);
				const thirdRow = new ActionRowBuilder().addComponents(tier2RoleInput);
				const fourthRow = new ActionRowBuilder().addComponents(tier3RoleInput);

				modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);
				await interaction.showModal(modal);
			}

			if (interaction.customId === 'config_sync') {
				// Create sync configuration modal
				const modal = new ModalBuilder()
					.setCustomId('config_sync_modal')
					.setTitle('Configure Sync Settings');

				const syncIntervalInput = new TextInputBuilder()
					.setCustomId('sync_interval')
					.setLabel('Sync Interval (minutes)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter minutes between syncs (e.g., 720 for 12 hours)')
					.setRequired(false)
					.setMaxLength(5);

				const firstRow = new ActionRowBuilder().addComponents(syncIntervalInput);
				modal.addComponents(firstRow);
				await interaction.showModal(modal);
			}
		}

		// Handle channel select menu interactions
		if (interaction.isChannelSelectMenu()) {
			if (interaction.customId === 'verify_log_select') {
				const selectedChannel = interaction.values[0];
				
				const fs = require('fs');
				const path = require('path');
				const configPath = path.join(__dirname, '../data/verify_log_channels.json');
				
				let config = {};
				if (fs.existsSync(configPath)) {
					config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
				}
				config[interaction.guild.id] = selectedChannel;
				
				const dataDir = path.dirname(configPath);
				if (!fs.existsSync(dataDir)) {
					fs.mkdirSync(dataDir, { recursive: true });
				}
				fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

				// Show completion message with option to configure feedback channel
				const completionEmbed = new EmbedBuilder()
					.setTitle('✅ Verify Log Channel Configured')
					.setDescription(`Verify log channel has been set to <#${selectedChannel}>`)
					.setColor(0x00FF99)
					.addFields({
						name: '🔄 Next Step',
						value: 'Would you like to configure the feedback channel as well?',
						inline: false
					});

				const nextButton = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId('configure_feedback')
							.setLabel('💬 Configure Feedback Channel')
							.setStyle(ButtonStyle.Secondary),
						new ButtonBuilder()
							.setCustomId('config_complete')
							.setLabel('✅ Done')
							.setStyle(ButtonStyle.Success)
					);

				await interaction.update({
					embeds: [completionEmbed],
					components: [nextButton]
				});
			}

			if (interaction.customId === 'feedback_channel_select') {
				const selectedChannel = interaction.values[0];
				
				const fs = require('fs');
				const path = require('path');
				const configPath = path.join(__dirname, '../data/feedback_channels.json');
				
				let config = {};
				if (fs.existsSync(configPath)) {
					config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
				}
				config[interaction.guild.id] = selectedChannel;
				
				const dataDir = path.dirname(configPath);
				if (!fs.existsSync(dataDir)) {
					fs.mkdirSync(dataDir, { recursive: true });
				}
				fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

				// Show completion message with option to configure verify log
				const completionEmbed = new EmbedBuilder()
					.setTitle('✅ Feedback Channel Configured')
					.setDescription(`Feedback channel has been set to <#${selectedChannel}>`)
					.setColor(0x00FF99)
					.addFields({
						name: '🔄 Next Step',
						value: 'Would you like to configure the verify log channel as well?',
						inline: false
					});

				const nextButton = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId('configure_verify_log')
							.setLabel('📝 Configure Verify Log')
							.setStyle(ButtonStyle.Secondary),
						new ButtonBuilder()
							.setCustomId('config_complete')
							.setLabel('✅ Done')
							.setStyle(ButtonStyle.Success)
					);

				await interaction.update({
					embeds: [completionEmbed],
					components: [nextButton]
				});
			}
		}

		// Handle completion button
		if (interaction.isButton() && interaction.customId === 'config_complete') {
			const finalEmbed = new EmbedBuilder()
				.setTitle('🎉 Configuration Complete')
				.setDescription('All channel configurations have been saved successfully!')
				.setColor(0x00FF99)
				.setFooter({ text: 'You can run /config again anytime to make changes' });

			await interaction.update({
				embeds: [finalEmbed],
				components: []
			});
		}

		// Handle config modal submissions
		if (interaction.isModalSubmit()) {
			if (interaction.customId === 'config_roles_modal') {
				await interaction.reply({
					content: '⚠️ Role configuration requires server restart to take effect. Please update your `.env` file manually for now.\n\n' +
							 'This feature will be enhanced in a future update.',
					ephemeral: true
				});
			}

			if (interaction.customId === 'config_sync_modal') {
				await interaction.reply({
					content: '⚠️ Sync interval configuration requires server restart to take effect. Please update your `config/bot.js` file manually for now.\n\n' +
							 'This feature will be enhanced in a future update.',
					ephemeral: true
				});
			}
		}

		// Slash command handler
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) return;

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				await interaction.reply({ content: '❌ Command failed.', flags: 64 });
			}
		}
	}
};