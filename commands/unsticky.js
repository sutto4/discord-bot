const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unsticky')
		.setDescription('Remove the sticky message from this channel')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

	async execute(interaction) {
		const guildId = interaction.guild.id;
		const channelId = interaction.channel.id;

		try {
			// Check if sticky messages feature is enabled
			const features = await GuildDatabase.getGuildFeatures(guildId);
			if (!features.sticky_messages) {
				return await interaction.reply({
					content: '❌ Sticky messages feature is not enabled for this server.',
					ephemeral: true
				});
			}

			// Check if there's a sticky message in this channel
			const stickyMessage = await GuildDatabase.getStickyMessage(guildId, channelId);
			
			if (!stickyMessage) {
				return await interaction.reply({
					content: '❌ No sticky message found in this channel.',
					ephemeral: true
				});
			}

			// Delete the sticky message from Discord
			try {
				const message = await interaction.channel.messages.fetch(stickyMessage.message_id);
				await message.delete();
			} catch (error) {
				console.log(`Sticky message not found or already deleted: ${stickyMessage.message_id}`);
			}

			// Remove from database
			await GuildDatabase.deleteStickyMessage(guildId, channelId);

			// Remove from memory cache
			if (global.stickyMessages) {
				global.stickyMessages.delete(`${guildId}-${channelId}`);
			}

			await interaction.reply({
				content: '✅ Sticky message removed successfully!',
				ephemeral: true
			});

		} catch (error) {
			console.error('Error removing sticky message:', error);
			await interaction.reply({
				content: '❌ Failed to remove sticky message. Please try again.',
				ephemeral: true
			});
		}
	},
};
