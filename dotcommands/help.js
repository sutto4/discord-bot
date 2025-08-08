const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
	name: 'help',
	description: 'Shows all available dot commands',
	
	async execute(message, args) {
		try {
			const dotCommandsPath = path.join(__dirname, '../dotcommands');
			const commandFiles = fs.readdirSync(dotCommandsPath).filter(file => file.endsWith('.js'));

			const embed = new EmbedBuilder()
				.setTitle('🔧 Available Dot Commands')
				.setDescription('Here are all the available dot commands you can use:')
				.setColor(0x5865F2);

			for (const file of commandFiles) {
				try {
					const command = require(path.join(dotCommandsPath, file));
					const commandName = file.replace('.js', '');
					embed.addFields({
						name: `.${commandName}`,
						value: command.description || 'No description available',
						inline: false
					});
				} catch (err) {
					console.error(`Failed to load command info for ${file}:`, err);
				}
			}

			embed.setFooter({ text: 'Use .commandname to execute a command' })
				.setTimestamp();

			await message.reply({ embeds: [embed] });

		} catch (error) {
			console.error('Error in help command:', error);
			await message.reply('❌ An error occurred while loading the help menu.');
		}
	}
};
