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
		console.log(`[STICKY] Command started - User: ${interaction.user.tag}, Guild: ${interaction.guild?.id}`);
		
		try {
			const guildId = interaction.guild.id;
			const channelId = interaction.channel.id;
			const userId = interaction.user.id;
			const message = interaction.options.getString('message');
			
			console.log(`[STICKY] Parameters - Guild: ${guildId}, Channel: ${channelId}, User: ${userId}, Message: ${message}`);
			console.log(`[STICKY] Command executed by ${interaction.user.tag} in guild ${guildId}`);
			
			// Check if moderation feature is enabled (sticky is a moderation command)
			const features = await GuildDatabase.getGuildFeatures(guildId);
			console.log(`[STICKY] Guild features:`, features);
			console.log(`[STICKY] moderation enabled:`, features.moderation);
			
			if (!features.moderation) {
				console.log(`[STICKY] Moderation feature not enabled, denying access`);
				return await interaction.reply({
					content: '❌ Moderation feature is not enabled for this server.',
					flags: 64 // Ephemeral flag
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
				content: `${message}`,
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
				flags: 64 // Ephemeral flag
			});

		} catch (error) {
			console.error('Error creating sticky message:', error);
			await interaction.reply({
				content: '❌ Failed to create sticky message. Please try again.',
				flags: 64 // Ephemeral flag
			});
		}
	},
};
