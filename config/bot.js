require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
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
});

// Start the webhook server for immediate updates
require('../webhook-server');

// Login using bot token from .env
client.login(process.env.TOKEN);

module.exports = client;
