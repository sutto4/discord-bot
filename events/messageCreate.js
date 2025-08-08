const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildPrefix } = require('../utils/prefix');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		// Ignore messages from bots
		if (message.author.bot) return;

		const prefix = await getGuildPrefix(message.guild?.id);

		if (!prefix || (!message.content.startsWith(prefix) && !message.content.startsWith('!'))) return;

		const usedPrefix = message.content.startsWith(prefix) ? prefix : '!';

		const args = message.content.slice(usedPrefix.length).trim().split(/\s+/);
		const commandName = args.shift()?.toLowerCase();

		// Load dot commands dynamically
		const dotCommandsPath = path.join(__dirname, '../dotcommands');
		const commandFile = path.join(dotCommandsPath, `${commandName}.js`);

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
