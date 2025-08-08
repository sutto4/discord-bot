const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		// Ignore messages from bots
		if (message.author.bot) return;

		// Check if message starts with a dot
		if (!message.content.startsWith('.')) return;

		// Parse command and arguments
		const args = message.content.slice(1).trim().split(/ +/);
		const commandName = args.shift().toLowerCase();

		// Load dot commands dynamically
		const dotCommandsPath = path.join(__dirname, '../dotcommands');
		const commandFile = path.join(dotCommandsPath, `${commandName}.js`);

		// Check if command file exists
		if (!fs.existsSync(commandFile)) return;

		try {
			const command = require(commandFile);
			await command.execute(message, args);
		} catch (error) {
			console.error(`Error executing dot command ${commandName}:`, error);
			await message.reply('❌ An error occurred while executing this command.');
		}
	},
};
