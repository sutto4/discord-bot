const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildPrefix } = require('../utils/prefix');

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot || !message.guild) return;

		const prefix = await getGuildPrefix(message.guild.id);
		if (!prefix || !message.content.startsWith(prefix)) return;

		// Get command and args
		const args = message.content.slice(prefix.length).trim().split(/\s+/);
		const commandName = args.shift()?.toLowerCase();

		// Path to dotcommands
		const dotCommandsPath = path.join(__dirname, '../dotcommands');
		const commandPath = path.join(dotCommandsPath, `${commandName}.js`);

		if (!fs.existsSync(commandPath)) return;

		try {
			// Always delete from require cache to force reloading
			delete require.cache[require.resolve(commandPath)];
			const command = require(commandPath);
			await command.execute(message, args);
		} catch (error) {
			console.error(`❌ Error executing command '${commandName}':`, error);
			await message.reply('❌ An error occurred while running this command.');
		}
	},
};
