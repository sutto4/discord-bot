const fs = require('fs');
const path = require('path');
const db = require('../config/database-multi-guild');
const { Collection } = require('discord.js');

// Load all dotcommands into a collection
const dotcommands = new Collection();
const dotCommandFiles = fs.readdirSync(path.join(__dirname, '../dotcommands')).filter(file => file.endsWith('.js'));

for (const file of dotCommandFiles) {
	const command = require(`../dotcommands/${file}`);
	if (command && command.name && typeof command.execute === 'function') {
		dotcommands.set(command.name, command);
	}
}

// Main handler
module.exports = async function handleDotCommand(message) {
	// Ignore bots and DMs
	if (message.author.bot || !message.guild) return;

	const guildId = message.guild.id;

	let prefix = '.';
	try {
		const [rows] = await db.query('SELECT custom_prefix FROM guilds WHERE guild_id = ?', [guildId]);
		if (rows.length > 0 && rows[0].custom_prefix) {
			prefix = rows[0].custom_prefix;
		}
	} catch (err) {
		console.error(`[PREFIX FETCH ERROR]`, err);
	}

	if (!message.content.startsWith(prefix)) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();

	const command = dotcommands.get(commandName);
	if (!command) return;

	try {
		await command.execute(message, args);
	} catch (err) {
		console.error(`[DOT COMMAND ERROR]`, err);
		await message.reply('❌ An error occurred while executing that command.');
	}
};
