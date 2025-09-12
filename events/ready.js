const { GuildDatabase } = require('../config/database-multi-guild');
const fetch = require('node-fetch');

// Bot monitoring integration with CCC web app
async function reportBotStatus(client, isStartup = false) {
	try {
		const webAppUrl = process.env.CCC_WEB_APP_URL || 'http://localhost:3000';

		const statusData = {
			online: true,
			uptime: process.uptime(),
			activeGuilds: client.guilds.cache.size,
			totalUsers: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
			commandsProcessed: global.commandCount || 0,
			memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
			version: process.env.npm_package_version || '1.0.0',
			nodeVersion: process.version,
			startTime: Date.now() - (process.uptime() * 1000),
			lastActivity: Date.now(),
			isStartup: isStartup
		};

		const response = await fetch(`${webAppUrl}/api/bot-status`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'ServerMate-DiscordBot/1.0'
			},
			body: JSON.stringify(statusData),
			timeout: 5000
		});

		if (response.ok) {
			console.log(`🤖 [BOT-MONITOR] ${isStartup ? 'Startup' : 'Status'} report sent to CCC web app`);
		} else {
			console.warn(`🤖 [BOT-MONITOR] Failed to send status to CCC: ${response.status}`);
		}
	} catch (error) {
		console.warn('🤖 [BOT-MONITOR] Error reporting status to CCC:', error.message);
	}
}

module.exports = {
	name: 'ready',
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);

		// Initialize all guilds in database
		console.log('Initializing guilds in database...');
		for (const guild of client.guilds.cache.values()) {
			await GuildDatabase.initializeGuild(guild.id, guild.name);
			console.log(`✅ Initialized guild: ${guild.name} (${guild.id})`);
		}
		console.log(`Database initialized for ${client.guilds.cache.size} guilds`);

		// Initialize command counter
		if (!global.commandCount) {
			global.commandCount = 0;
		}

		// Load sticky messages into memory cache
		console.log('Loading sticky messages into memory cache...');
		await loadStickyMessages(client);

		// Send initial status to CCC web app
		await reportBotStatus(client, true);

		// Set up periodic status reporting every 30 seconds
		setInterval(() => {
			reportBotStatus(client, false);
		}, 30000);

		console.log('🤖 [BOT-MONITOR] Status reporting to CCC web app initialized');
	},
};

// Load sticky messages into memory cache
async function loadStickyMessages(client) {
	try {
		const stickyMessages = await GuildDatabase.loadAllStickyMessages();
		
		// Initialize global sticky messages cache
		global.stickyMessages = new Map();
		
		let loadedCount = 0;
		for (const sticky of stickyMessages) {
			try {
				// Verify the channel still exists and bot has access
				const guild = client.guilds.cache.get(sticky.guild_id);
				if (guild) {
					const channel = guild.channels.cache.get(sticky.channel_id);
					if (channel && channel.isTextBased()) {
						// Store in memory cache
						global.stickyMessages.set(`${sticky.guild_id}-${sticky.channel_id}`, {
							messageId: sticky.message_id,
							content: sticky.content,
							createdBy: sticky.created_by
						});
						loadedCount++;
					} else {
						// Channel doesn't exist or bot can't access it, clean up
						await GuildDatabase.deleteStickyMessage(sticky.guild_id, sticky.channel_id);
						console.log(`🧹 Cleaned up sticky message for non-existent channel: ${sticky.guild_id}/${sticky.channel_id}`);
					}
				} else {
					// Guild doesn't exist, clean up
					await GuildDatabase.deleteStickyMessage(sticky.guild_id, sticky.channel_id);
					console.log(`🧹 Cleaned up sticky message for non-existent guild: ${sticky.guild_id}`);
				}
			} catch (error) {
				console.error(`Error loading sticky message ${sticky.guild_id}/${sticky.channel_id}:`, error);
			}
		}
		
		console.log(`📌 Loaded ${loadedCount} sticky messages into memory cache`);
	} catch (error) {
		console.error('Error loading sticky messages:', error);
	}
}