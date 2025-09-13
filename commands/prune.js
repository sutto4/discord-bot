const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('prune')
		.setDescription('Delete messages from the channel with various options')
		.addSubcommand(subcommand =>
			subcommand
				.setName('count')
				.setDescription('Delete the last N messages')
				.addIntegerOption(option =>
					option.setName('amount')
						.setDescription('Number of messages to delete (1-100)')
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(100)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('from')
				.setDescription('Delete all messages from a specific message ID to the end')
				.addStringOption(option =>
					option.setName('message_id')
						.setDescription('The message ID to start deleting from')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('user')
				.setDescription('Delete messages from a specific user within a time period')
				.addUserOption(option =>
					option.setName('target')
						.setDescription('The user whose messages to delete')
						.setRequired(true))
				.addStringOption(option =>
					option.setName('duration')
						.setDescription('Time period to look back (e.g., 1h, 7d, 30d)')
						.setRequired(true)
						.setChoices(
							{ name: 'Last hour', value: '1h' },
							{ name: 'Last 6 hours', value: '6h' },
							{ name: 'Last 24 hours', value: '24h' },
							{ name: 'Last 7 days', value: '7d' },
							{ name: 'Last 30 days', value: '30d' },
							{ name: 'All time', value: 'all' }
						)))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

	async execute(interaction) {
		console.log(`[PRUNE] Command started - User: ${interaction.user.tag}, Guild: ${interaction.guild?.id}`);
		
		try {
			const guildId = interaction.guild.id;
			const channel = interaction.channel;
			const userId = interaction.user.id;
			
			// Check if moderation feature is enabled
			const features = await GuildDatabase.getGuildFeatures(guildId);
			console.log(`[PRUNE] moderation enabled:`, features.moderation);
			
			if (!features.moderation) {
				console.log(`[PRUNE] Moderation feature not enabled, denying access`);
				return await interaction.reply({
					content: '❌ Moderation feature is not enabled for this server.',
					flags: 64
				});
			}

			const subcommand = interaction.options.getSubcommand();
			
			if (subcommand === 'count') {
				await handleCountPrune(interaction, channel);
			} else if (subcommand === 'from') {
				await handleFromPrune(interaction, channel);
			} else if (subcommand === 'user') {
				await handleUserPrune(interaction, channel);
			}

		} catch (error) {
			console.error('[PRUNE] Error:', error);
			await interaction.reply({
				content: '❌ An error occurred while processing the prune command.',
				flags: 64
			});
		}
	}
};

async function handleCountPrune(interaction, channel) {
	const amount = interaction.options.getInteger('amount');
	
	// Defer reply since this might take a moment
	await interaction.deferReply({ flags: 64 });
	
	try {
		// Fetch messages
		const messages = await channel.messages.fetch({ limit: amount });
		const messagesToDelete = messages.filter(msg => !msg.pinned);
		
		if (messagesToDelete.size === 0) {
			return await interaction.editReply({
				content: '❌ No messages found to delete (all messages are pinned).'
			});
		}
		
		// Delete messages
		await channel.bulkDelete(messagesToDelete, true);
		
		await interaction.editReply({
			content: `✅ Successfully deleted ${messagesToDelete.size} message(s).`
		});
		
		console.log(`[PRUNE] Deleted ${messagesToDelete.size} messages by count`);
		
	} catch (error) {
		console.error('[PRUNE] Count prune error:', error);
		await interaction.editReply({
			content: '❌ Failed to delete messages. Make sure messages are less than 14 days old.'
		});
	}
}

async function handleFromPrune(interaction, channel) {
	const messageId = interaction.options.getString('message_id');
	
	// Defer reply since this might take a moment
	await interaction.deferReply({ flags: 64 });
	
	try {
		// Fetch the starting message
		const startMessage = await channel.messages.fetch(messageId);
		const startTime = startMessage.createdAt;
		
		// Count messages from that point
		let messageCount = 0;
		let lastMessageId = null;
		
		// Fetch messages in batches to count them
		while (true) {
			const options = { limit: 100 };
			if (lastMessageId) options.before = lastMessageId;
			
			const messages = await channel.messages.fetch(options);
			const relevantMessages = messages.filter(msg => 
				msg.createdAt >= startTime && !msg.pinned
			);
			
			messageCount += relevantMessages.size;
			
			if (messages.size < 100) break;
			lastMessageId = messages.last().id;
		}
		
		// Show warning if count is high
		if (messageCount > 50) {
			const warningEmbed = new EmbedBuilder()
				.setColor(0xFFA500)
				.setTitle('⚠️ High Message Count Warning')
				.setDescription(`This will delete **${messageCount}** messages from this channel.\n\nAre you sure you want to continue?`)
				.addFields(
					{ name: 'Starting from', value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`, inline: true },
					{ name: 'Message ID', value: messageId, inline: true }
				)
				.setFooter({ text: 'This action cannot be undone!' });
			
			return await interaction.editReply({
				content: '⚠️ **High message count detected!**',
				embeds: [warningEmbed]
			});
		}
		
		// Proceed with deletion
		let deletedCount = 0;
		lastMessageId = null;
		
		while (true) {
			const options = { limit: 100 };
			if (lastMessageId) options.before = lastMessageId;
			
			const messages = await channel.messages.fetch(options);
			const messagesToDelete = messages.filter(msg => 
				msg.createdAt >= startTime && !msg.pinned
			);
			
			if (messagesToDelete.size > 0) {
				await channel.bulkDelete(messagesToDelete, true);
				deletedCount += messagesToDelete.size;
			}
			
			if (messages.size < 100) break;
			lastMessageId = messages.last().id;
		}
		
		await interaction.editReply({
			content: `✅ Successfully deleted ${deletedCount} message(s) from message ID ${messageId}.`
		});
		
		console.log(`[PRUNE] Deleted ${deletedCount} messages from message ID ${messageId}`);
		
	} catch (error) {
		console.error('[PRUNE] From prune error:', error);
		await interaction.editReply({
			content: '❌ Failed to delete messages. Make sure the message ID is valid and messages are less than 14 days old.'
		});
	}
}

async function handleUserPrune(interaction, channel) {
	const target = interaction.options.getUser('target');
	const duration = interaction.options.getString('duration');
	
	// Defer reply since this might take a moment
	await interaction.deferReply({ flags: 64 });
	
	try {
		let startTime;
		
		if (duration === 'all') {
			startTime = new Date(0); // Beginning of time
		} else {
			const now = new Date();
			const durationMap = {
				'1h': 60 * 60 * 1000,
				'6h': 6 * 60 * 60 * 1000,
				'24h': 24 * 60 * 60 * 1000,
				'7d': 7 * 24 * 60 * 60 * 1000,
				'30d': 30 * 24 * 60 * 60 * 1000
			};
			
			startTime = new Date(now.getTime() - durationMap[duration]);
		}
		
		// Count messages from user in time period
		let messageCount = 0;
		let lastMessageId = null;
		
		while (true) {
			const options = { limit: 100 };
			if (lastMessageId) options.before = lastMessageId;
			
			const messages = await channel.messages.fetch(options);
			const relevantMessages = messages.filter(msg => 
				msg.author.id === target.id && 
				msg.createdAt >= startTime && 
				!msg.pinned
			);
			
			messageCount += relevantMessages.size;
			
			if (messages.size < 100) break;
			lastMessageId = messages.last().id;
		}
		
		if (messageCount === 0) {
			return await interaction.editReply({
				content: `❌ No messages found from ${target.tag} in the specified time period.`
			});
		}
		
		// Show warning if count is high
		if (messageCount > 50) {
			const warningEmbed = new EmbedBuilder()
				.setColor(0xFFA500)
				.setTitle('⚠️ High Message Count Warning')
				.setDescription(`This will delete **${messageCount}** messages from ${target.tag}.\n\nAre you sure you want to continue?`)
				.addFields(
					{ name: 'User', value: `${target.tag} (${target.id})`, inline: true },
					{ name: 'Time period', value: duration === 'all' ? 'All time' : `Last ${duration}`, inline: true }
				)
				.setFooter({ text: 'This action cannot be undone!' });
			
			return await interaction.editReply({
				content: '⚠️ **High message count detected!**',
				embeds: [warningEmbed]
			});
		}
		
		// Proceed with deletion
		let deletedCount = 0;
		lastMessageId = null;
		
		while (true) {
			const options = { limit: 100 };
			if (lastMessageId) options.before = lastMessageId;
			
			const messages = await channel.messages.fetch(options);
			const messagesToDelete = messages.filter(msg => 
				msg.author.id === target.id && 
				msg.createdAt >= startTime && 
				!msg.pinned
			);
			
			if (messagesToDelete.size > 0) {
				await channel.bulkDelete(messagesToDelete, true);
				deletedCount += messagesToDelete.size;
			}
			
			if (messages.size < 100) break;
			lastMessageId = messages.last().id;
		}
		
		await interaction.editReply({
			content: `✅ Successfully deleted ${deletedCount} message(s) from ${target.tag} in the last ${duration === 'all' ? 'all time' : duration}.`
		});
		
		console.log(`[PRUNE] Deleted ${deletedCount} messages from user ${target.tag} in ${duration}`);
		
	} catch (error) {
		console.error('[PRUNE] User prune error:', error);
		await interaction.editReply({
			content: '❌ Failed to delete messages. Make sure messages are less than 14 days old.'
		});
	}
}
