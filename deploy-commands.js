require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; 
const token = process.env.TOKEN;

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);

	console.log(`Loading: ${file}`);

	if (!command.data || typeof command.data.toJSON !== 'function') {
		console.warn(`⚠️ Skipping invalid command file: ${file}`);
		continue;
	}

	commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log(`Registering slash commands for guild ${guildId}...`);
		await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands }
		);
		console.log('✅ Slash commands registered (guild-specific).');
	} catch (error) {
		console.error(error);
	}
})();