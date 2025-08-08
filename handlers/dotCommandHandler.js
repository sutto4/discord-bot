const fs = require('fs');
const path = require('path');

function loadDotCommands(dir) {
	const commands = new Map();
	if (!fs.existsSync(dir)) return commands;
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith('.js')) continue;
		const cmd = require(path.join(dir, file));
		if (cmd?.name && typeof cmd.execute === 'function') {
			commands.set(cmd.name.toLowerCase(), cmd);
		}
	}
	return commands;
}

function registerDotCommandHandler(client, options = {}) {
	const {
		prefix = '.',
		commandsDir = path.join(__dirname, '..', 'dotcommands')
	} = options;

	const commands = loadDotCommands(commandsDir);

	client.on('messageCreate', async (message) => {
		if (message.author.bot) return;
		if (!message.content.startsWith(prefix)) return;

		const args = message.content.slice(prefix.length).trim().split(/\s+/);
		const name = args.shift()?.toLowerCase();
		if (!name) return;

		const cmd = commands.get(name);
		if (!cmd) return;

		try {
			await cmd.execute(message, args);
		} catch (err) {
			console.error('Dot command error:', err);
			message.reply('Command failed.');
		}
	});
}

module.exports = {
	registerDotCommandHandler
};
