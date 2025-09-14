const { Events, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { logToChannel } = require('../helpers/logger');
const { logFeedbackToChannel } = require('../helpers/feedbackLogger');
const { GuildDatabase } = require('../config/database-multi-guild');
const fetch = require('node-fetch');

// Command activity reporting to CCC web app
async function reportCommandActivity(interaction, commandName, startTime, success, errorMessage = null) {
	try {
		const webAppUrl = process.env.CCC_WEB_APP_URL || 'http://localhost:3000';
		const responseTime = Date.now() - startTime;

		// Increment global command counter
		if (!global.commandCount) global.commandCount = 0;
		global.commandCount++;

		const activityData = {
			command: commandName,
			userId: interaction.user.id,
			guildId: interaction.guild?.id,
			channelId: interaction.channel?.id,
			timestamp: Date.now(),
			responseTime: responseTime,
			success: success,
			errorMessage: errorMessage,
			args: interaction.options?.data?.map(opt => ({
				name: opt.name,
				value: opt.value,
				type: opt.type
			})) || []
		};

		const response = await fetch(`${webAppUrl}/api/bot-activity`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'ServerMate-DiscordBot/1.0'
			},
			body: JSON.stringify(activityData),
			timeout: 3000
		});

		if (response.ok) {
			console.log(`📊 [BOT-ACTIVITY] Command "${commandName}" reported to CCC (${responseTime}ms)`);
		} else {
			console.warn(`📊 [BOT-ACTIVITY] Failed to report command to CCC: ${response.status}`);
		}
	} catch (error) {
		console.warn('📊 [BOT-ACTIVITY] Error reporting command to CCC:', error.message);
	}
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		// Handle Role Menu selects: customId = rr_menu_<internalId>
		if (interaction.isStringSelectMenu() && interaction.customId && interaction.customId.startsWith('rr_menu_')) {
			const { appDb } = require('../config/database');
			try {
				await interaction.deferReply({ flags: 64 });
				const internalIdStr = interaction.customId.slice('rr_menu_'.length);
				const internalId = Number(internalIdStr);
				if (!Number.isFinite(internalId)) {
					return interaction.editReply({ content: 'Invalid menu id.' });
				}
				const selectedRoleIds = interaction.values.map(String);
				const guild = interaction.guild;
				if (!guild) return interaction.editReply({ content: 'No guild.' });
				const member = await guild.members.fetch(interaction.user.id).catch(() => null);
				if (!member) return interaction.editReply({ content: 'Member not found.' });

				// Load allowed roles for this menu from DB
				const [maps] = await appDb.execute(
					`SELECT role_id FROM reaction_role_mappings WHERE reaction_role_message_id = ?`,
					[internalId]
				);
				const allowed = Array.isArray(maps) ? maps.map(r => String(r.role_id)) : [];
				if (allowed.length === 0) return interaction.editReply({ content: 'No roles configured for this menu.' });

				const allowedSet = new Set(allowed);
				const desired = new Set(selectedRoleIds.filter(id => allowedSet.has(id)));
				const current = new Set(member.roles.cache.map(r => r.id).filter(id => allowedSet.has(id)));

				const toAdd = [...desired].filter(id => !current.has(id));
				const toRemove = [...current].filter(id => !desired.has(id));

				// Apply changes respecting permissions
				const added = [];
				const removed = [];
				for (const rid of toAdd) {
					const role = await guild.roles.fetch(rid).catch(() => null);
					if (role && role.editable) {
						await member.roles.add(role).catch(() => {});
						added.push(role.name);
					}
				}
				for (const rid of toRemove) {
					const role = await guild.roles.fetch(rid).catch(() => null);
					if (role && role.editable) {
						await member.roles.remove(role).catch(() => {});
						removed.push(role.name);
					}
				}

				const parts = [];
				if (added.length) parts.push(`Added: ${added.join(', ')}`);
				if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);
				if (parts.length === 0) parts.push('No changes.');
				await interaction.editReply({ content: parts.join(' \n') });
				return;
			} catch (e) {
				try { await interaction.editReply({ content: 'Failed to update roles.' }); } catch {}
				return;
			}
		}

		// Handle verify button
		if (interaction.isButton() && interaction.customId === 'verify_button') {
			let success = false;

			try {
				// Find or create the verify role
				let verifyRole = interaction.guild.roles.cache.find(role => role.name === 'Verified');
				if (!verifyRole) {
					verifyRole = await interaction.guild.roles.create({
						name: 'Verified',
						color: 0x00ff00,
						reason: 'Auto-created verify role by Chester Bot'
					});
				}

				// Check if bot can assign the verification role
				if (!verifyRole.editable) {
					console.error(`[VERIFICATION] Cannot assign role ${verifyRole.name} - role is not editable by bot`);
					await interaction.reply({
						content: '❌ Could not verify you. The verification role cannot be assigned by the bot.',
						flags: 64
					});
					return;
				}

				console.log(`[VERIFICATION] Assigning role ${verifyRole.name} to user ${interaction.user.tag} via verification`);
				await interaction.member.roles.add(verifyRole, 'User verification via web interface').catch((error) => {
					console.error(`[VERIFICATION] Failed to assign verification role ${verifyRole.name} to user ${interaction.user.tag}:`, error);
				});
				
				// Create enhanced verification completion message with feedback button
				const completionEmbed = new EmbedBuilder()
					.setTitle('✅ Verification Successful!')
					.setDescription('Welcome to the server! You now have access to all channels.')
					.setColor(0x00FF99)
					.setTimestamp();

				const feedbackButton = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId('open_feedback_modal')
							.setLabel('📝 Give Feedback')
							.setStyle(ButtonStyle.Secondary)
					);

				await interaction.reply({
					embeds: [completionEmbed],
					components: [feedbackButton],
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

			// 📊 Log verification to database
			await GuildDatabase.logVerification(
				interaction.guild.id,
				interaction.user.id,
				interaction.user.tag,
				success
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
						flags: 64
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
						flags: 64
					});
				}

				// 📊 Log feedback to database
				await GuildDatabase.logFeedback(
					interaction.guild.id,
					interaction.user.id,
					interaction.user.tag,
					feedbackType,
					subject,
					details,
					contact
				);
			} catch (error) {
				console.error('Error processing feedback:', error);
				await interaction.reply({
					content: '❌ There was an error submitting your feedback. Please try again later.',
					flags: 64
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
					flags: 64
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
				// Get server roles and create a string select menu
				const roles = interaction.guild.roles.cache
					.filter(role => role.editable && role.id !== interaction.guild.id) // Exclude @everyone
					.sort((a, b) => b.position - a.position) // Sort by position (highest first)
					.map(role => ({
						label: role.name,
						value: role.id,
						description: `Position: ${role.position}`
					}))
					.slice(0, 25); // Discord limit is 25 options

				const roleSelect = new ActionRowBuilder()
					.addComponents(
						new StringSelectMenuBuilder()
							.setCustomId('verify_role_select')
							.setPlaceholder('Select verify role')
							.addOptions(roles)
					);

				const embed = new EmbedBuilder()
					.setTitle('🎭 Select Verify Role')
					.setDescription('Choose which role should be assigned to verified members:')
					.setColor(0x5865F2)
					.setFooter({ text: 'Select a role from the dropdown below' });

				await interaction.reply({
					embeds: [embed],
					components: [roleSelect],
					flags: 64
				});
			}

		}

		// Handle string select menu interactions (role selection)
		if (interaction.isStringSelectMenu()) {
			if (interaction.customId === 'verify_role_select') {
				const selectedRoleId = interaction.values[0];
				const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
				
				try {
					// Update verify role in database
					const { query } = require('../config/database-multi-guild');
					await query(
						`UPDATE guilds SET verify_role_id = ? WHERE guild_id = ?`,
						[selectedRoleId, interaction.guild.id]
					);

					const successEmbed = new EmbedBuilder()
						.setTitle('✅ Verify Role Configured')
						.setDescription(`Verify role has been set to ${selectedRole}`)
						.setColor(0x00FF99)
						.addFields({
							name: '🔄 Next Step',
							value: 'The verify role is now configured. You can run `/config` again to make changes.',
							inline: false
						});

					const doneButton = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId('config_complete')
								.setLabel('✅ Done')
								.setStyle(ButtonStyle.Success)
						);

					await interaction.update({
						embeds: [successEmbed],
						components: [doneButton]
					});
				} catch (error) {
					console.error('Error updating verify role:', error);
					await interaction.update({
						content: '❌ Failed to save verify role. Please try again.',
						embeds: [],
						components: []
					});
				}
			}
		}

		// Handle channel select menu interactions
		if (interaction.isChannelSelectMenu()) {
			if (interaction.customId === 'verify_log_select') {
				const selectedChannel = interaction.values[0];
				
				try {
					// Update verify channel in database
					const { query } = require('../config/database-multi-guild');
					await query(
						`UPDATE guilds SET verify_channel_id = ? WHERE guild_id = ?`,
						[selectedChannel, interaction.guild.id]
					);

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
				} catch (error) {
					console.error('Error updating verify channel:', error);
					await interaction.update({
						content: '❌ Failed to save verify channel. Please try again.',
						embeds: [],
						components: []
					});
				}
			}

			if (interaction.customId === 'feedback_channel_select') {
				const selectedChannel = interaction.values[0];
				
				try {
					// Update feedback channel in database
					const { query } = require('../config/database-multi-guild');
					await query(
						`UPDATE guilds SET feedback_channel_id = ? WHERE guild_id = ?`,
						[selectedChannel, interaction.guild.id]
					);

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
				} catch (error) {
					console.error('Error updating feedback channel:', error);
					await interaction.update({
						content: '❌ Failed to save feedback channel. Please try again.',
						embeds: [],
						components: []
					});
				}
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
			// No modal submissions needed anymore
		}

		// Slash command handler
		if (interaction.isChatInputCommand()) {
			const commandName = interaction.commandName;
			const startTime = Date.now();

			// First try the CommandManager for dynamic commands
			if (interaction.client.commandManager) {
				await interaction.client.commandManager.handleInteraction(interaction);

				// Report command activity to CCC web app
				await reportCommandActivity(interaction, commandName, startTime, true);
				return;
			}

			// Fallback to existing command system
			const command = interaction.client.commands.get(interaction.commandName);
			if (!command) return;

			try {
				await command.execute(interaction);

				// Report command activity to CCC web app
				await reportCommandActivity(interaction, commandName, startTime, true);
			} catch (error) {
				console.error(error);

				// Report failed command activity to CCC web app
				await reportCommandActivity(interaction, commandName, startTime, false, error.message);

				await interaction.reply({ content: '❌ Command failed.', flags: 64 });
			}
		}
	}
};
