const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sticky')
		.setDescription('Create a sticky message that stays at the bottom of the channel')
		.addStringOption(option =>
			option.setName('message')
				.setDescription('The message content to make sticky')
				.setRequired(true)
				.setMaxLength(2000))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

	async execute(interaction) {
		const guildId = interaction.guild.id;
		const channelId = interaction.channel.id;
		const userId = interaction.user.id;
		const message = interaction.options.getString('message');

		try {
			// Check if sticky messages feature is enabled
			const features = await GuildDatabase.getGuildFeatures(guildId);
			if (!features.sticky_messages) {
				return await interaction.reply({
					content: '❌ Sticky messages feature is not enabled for this server.',
					ephemeral: true
				});
			}

			// Check if there's already a sticky message in this channel
			const existingSticky = await GuildDatabase.getStickyMessage(guildId, channelId);
			
			if (existingSticky) {
				// Update existing sticky
				await GuildDatabase.updateStickyMessage(guildId, channelId, message, userId);
				
				// Delete old sticky message if it still exists
				try {
					const oldMessage = await interaction.channel.messages.fetch(existingSticky.message_id);
					await oldMessage.delete();
				} catch (error) {
					// Message might already be deleted, ignore error
					console.log(`Old sticky message not found or already deleted: ${existingSticky.message_id}`);
				}
			} else {
				// Create new sticky
				await GuildDatabase.createStickyMessage(guildId, channelId, message, userId);
			}

			// Post new sticky message
			const stickyMessage = await interaction.channel.send({
				content: `📌 **Sticky Message**\n${message}`,
				allowedMentions: { parse: [] } // Disable mentions to prevent spam
			});

			// Update the message ID in database
			await GuildDatabase.updateStickyMessageId(guildId, channelId, stickyMessage.id);

			// Store in memory cache for fast access
			if (!global.stickyMessages) {
				global.stickyMessages = new Map();
			}
			global.stickyMessages.set(`${guildId}-${channelId}`, {
				messageId: stickyMessage.id,
				content: message,
				createdBy: userId
			});

			await interaction.reply({
				content: '✅ Sticky message created successfully! It will stay at the bottom of the channel.',
				ephemeral: true
			});

		} catch (error) {
			console.error('Error creating sticky message:', error);
			await interaction.reply({
				content: '❌ Failed to create sticky message. Please try again.',
				ephemeral: true
			});
		}
	},
};
