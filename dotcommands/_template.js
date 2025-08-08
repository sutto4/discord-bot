const { EmbedBuilder } = require('discord.js');
// const db = require('../config/database'); // Uncomment if you need database access

module.exports = {
	name: 'template', // Change this to your command name
	description: 'Template for creating new dot commands', // Change this description
	
	async execute(message, args) {
		try {
			// Your command logic goes here
			
			const embed = new EmbedBuilder()
				.setTitle('🔧 Template Command')
				.setDescription('This is a template for creating new dot commands.')
				.setColor(0x5865F2)
				.addFields(
					{ name: 'Arguments received', value: args.length > 0 ? args.join(' ') : 'None', inline: false }
				)
				.setFooter({ text: 'Replace this with your own command logic' })
				.setTimestamp();

			await message.reply({ embeds: [embed] });

		} catch (error) {
			console.error('Error in template command:', error);
			await message.reply('❌ An error occurred while executing this command.');
		}
	}
};
