require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',').map(id => id.trim()) : [process.env.GUILD_ID];
const token = process.env.TOKEN;

// ServerMate Guild ID for management commands
const SERVERMATE_GUILD_ID = '1403257704222429224';

const allCommands = [];
const managementCommands = []; // Commands only for ServerMate
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

	// Check if this is a ServerMate management command
	if (file === 'setdmreply.js') {
		managementCommands.push(command.data.toJSON());
		console.log(`🔧 Added to management commands: ${file}`);
	} else {
		allCommands.push(command.data.toJSON());
		console.log(`📋 Added to all commands: ${file}`);
	}
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log(`🚀 Starting command deployment...`);
		console.log(`📋 General commands: ${allCommands.length}`);
		console.log(`🔧 Management commands: ${managementCommands.length}`);

		// Deploy general commands to all guilds
		console.log(`\n📋 Deploying general commands to ${guildIds.length} guild(s)...`);
		for (const guildId of guildIds) {
			if (!guildId) {
				console.warn('⚠️ Skipping empty guild ID');
				continue;
			}

			console.log(`Deploying general commands to guild: ${guildId}`);
			await rest.put(
				Routes.applicationGuildCommands(clientId, guildId),
				{ body: allCommands }
			);
		}

		// Deploy management commands only to ServerMate
		if (managementCommands.length > 0) {
			console.log(`\n🔧 Deploying management commands to ServerMate only...`);
			console.log(`Deploying management commands to guild: ${SERVERMATE_GUILD_ID}`);

			await rest.put(
				Routes.applicationGuildCommands(clientId, SERVERMATE_GUILD_ID),
				{ body: [...allCommands, ...managementCommands] }
			);

			console.log(`✅ Management commands deployed to ServerMate`);
		}

		console.log('\n🎉 Command deployment completed!');
		console.log(`📊 Summary:`);
		console.log(`   • General commands: ${allCommands.length} (all guilds)`);
		console.log(`   • Management commands: ${managementCommands.length} (ServerMate only)`);
		console.log(`   • Total guilds: ${guildIds.length}`);

	} catch (error) {
		console.error('❌ Deployment failed:', error);
	}
})();