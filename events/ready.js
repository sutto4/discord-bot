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

		// Send initial status to CCC web app
		await reportBotStatus(client, true);

		// Set up periodic status reporting every 30 seconds
		setInterval(() => {
			reportBotStatus(client, false);
		}, 30000);

		console.log('🤖 [BOT-MONITOR] Status reporting to CCC web app initialized');
	},
};