require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const syncDonators = require('../jobs/syncDonators');
const { processCreatorAlerts } = require('../jobs/creatorAlerts');
const { applyBotCustomizationForAllGuilds } = require('../jobs/botCustomization');

// Create Discord client with required intents
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.MessageContent
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
		Partials.User,
		Partials.GuildMember
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

	await syncDonators(client); // Run once on startup

	const minutes = 720; // Change this to however often you want
	setInterval(() => syncDonators(client), minutes * 60 * 1000);
	
	// Creator alerts processing on startup + interval
	await processCreatorAlerts(client); // Run once on startup
	
	const creatorAlertsMinutes = parseInt(process.env.CREATOR_ALERTS_POLL_SECONDS || '60') / 60; // Convert seconds to minutes
	setInterval(() => processCreatorAlerts(client), creatorAlertsMinutes * 60 * 1000);
	
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
