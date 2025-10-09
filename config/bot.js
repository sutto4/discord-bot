require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const syncDonators = require('../jobs/syncDonators');
const { processCreatorAlerts } = require('../jobs/creatorAlerts');
const { applyBotCustomizationForAllGuilds } = require('../jobs/botCustomization');
const { setupAccessControlEvents } = require('../events/accessControlEvents');
const { startupAccessCleanup } = require('../jobs/startupAccessCleanup');
const { setupMemberCountEvents, startupMemberCountSync } = require('../events/memberCountEvents');

// Create Discord client with required intents
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
		Partials.User,
		Partials.GuildMember,
		Partials.ThreadMember
	]
});

client.commands = new Collection();

// Function to update bot activity with user count
async function updateBotActivityWithUserCount(client) {
	try {
		const { appDb } = require('./database');
		
		// Get total member count from all active guilds
		const [rows] = await appDb.query(
			'SELECT SUM(member_count) as total_members FROM guilds WHERE status = "active"'
		);
		
		const totalMembers = rows[0]?.total_members || 0;
		const activityText = `${totalMembers.toLocaleString()} users`;
		
		await client.user.setActivity(activityText, { type: ActivityType.Watching });
		console.log(`[BOT] Set activity: WATCHING ${activityText}`);
		
		return true;
	} catch (error) {
		console.error('[BOT] Failed to set activity with user count:', error);
		// Fallback to default
		await client.user.setActivity('your servers', { type: ActivityType.Watching });
		return false;
	}
}

// Function to update bot activity with custom text
function updateBotActivity(text, type = 'WATCHING') {
	if (!client.user) {
		console.error('[BOT] Cannot update activity - bot not ready');
		return false;
	}
	
	try {
		// Map string type to ActivityType enum
		const activityTypeMap = {
			'PLAYING': ActivityType.Playing,
			'WATCHING': ActivityType.Watching,
			'LISTENING': ActivityType.Listening,
			'STREAMING': ActivityType.Streaming
		};
		
		const activityType = activityTypeMap[type] || ActivityType.Watching;
		client.user.setActivity(text, { type: activityType });
		console.log(`[BOT] Updated activity: ${type} ${text}`);
		return true;
	} catch (error) {
		console.error('[BOT] Failed to update activity:', error);
		return false;
	}
}

// Make functions available globally
global.updateBotActivity = updateBotActivity;
global.updateBotActivityWithUserCount = updateBotActivityWithUserCount;

// Load slash commands
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const command = require(path.join(commandsPath, file));
	client.commands.set(command.data.name, command);
}

// Load event handlers
const eventsPath = path.join(__dirname, '../events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const event = require(path.join(eventsPath, file));
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args, client));
	} else {
		client.on(event.name, (...args) => event.execute(...args, client));
	}
}

// Donator sync on startup + interval
client.once('ready', async () => {
	console.log(`Logged in as ${client.user.tag}`);

	// Set bot activity to show total user count
	await updateBotActivityWithUserCount(client);

	// Make client available globally for webhook server
	global.client = client;

	// Setup access control event handlers
	setupAccessControlEvents(client);

	// Setup member count event handlers
	setupMemberCountEvents(client);

	// Run startup cleanup and reconciliation
	await startupAccessCleanup(client);
	await startupMemberCountSync(client);

	await syncDonators(client); // Run once on startup

	const minutes = 720; // Change this to however often you want
	setInterval(() => syncDonators(client), minutes * 60 * 1000);
	
	// Initialize Twitch EventSub (optional - requires public webhook)
	const { subscribeAllExistingAlerts } = require('../events/twitchEventSub');
	const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;
	const enableEventSub = WEBHOOK_BASE_URL && WEBHOOK_BASE_URL !== 'https://your-domain.com' && !WEBHOOK_BASE_URL.includes('localhost');
	
	if (enableEventSub) {
		console.log('[CREATOR-ALERTS] EventSub enabled - Twitch will use real-time webhooks');
		try {
			await subscribeAllExistingAlerts();
		} catch (error) {
			console.error('[CREATOR-ALERTS] EventSub subscription failed, falling back to polling for Twitch:', error);
		}
	} else {
		console.log('[CREATOR-ALERTS] EventSub disabled - using polling for all platforms (set WEBHOOK_BASE_URL to enable)');
	}
	
	// POLLING: Check all platforms (or non-Twitch if EventSub is enabled)
	const creatorAlertsMinutes = parseInt(process.env.CREATOR_ALERTS_POLL_SECONDS || '300') / 60;
	const skipTwitch = enableEventSub; // Only skip Twitch if EventSub is working
	
	if (skipTwitch) {
		console.log(`[CREATOR-ALERTS] Starting polling for non-Twitch platforms every ${creatorAlertsMinutes} minutes`);
	} else {
		console.log(`[CREATOR-ALERTS] Starting polling for ALL platforms every ${creatorAlertsMinutes} minutes`);
	}
	
	setInterval(() => processCreatorAlerts(client, { skipTwitch }), creatorAlertsMinutes * 60 * 1000);
	// Run once on startup
	processCreatorAlerts(client, { skipTwitch }).catch(err => console.error('[CREATOR-ALERTS] Startup error:', err));
	
	// Bot customization sync on startup + interval
	await applyBotCustomizationForAllGuilds(client); // Run once on startup
	
	const botCustomizationMinutes = 30; // Check for bot customization updates every 30 minutes
	setInterval(() => applyBotCustomizationForAllGuilds(client), botCustomizationMinutes * 60 * 1000);
	
	// Update bot activity with user count every hour
	const activityUpdateMinutes = 60;
	setInterval(() => updateBotActivityWithUserCount(client), activityUpdateMinutes * 60 * 1000);
	console.log(`[BOT] Scheduled activity updates every ${activityUpdateMinutes} minutes`);
});

// Start the webhook server for immediate updates
require('../webhook-server');

// Login using bot token from .env
client.login(process.env.TOKEN);

module.exports = client;
