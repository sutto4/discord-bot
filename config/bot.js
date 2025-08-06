require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const syncDonators = require('../jobs/syncDonators');

// Create Discord client with required intents
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	],
});

client.commands = new Collection();

// Load slash commandss
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
});

// Login using bot token from .env
client.login(process.env.TOKEN);