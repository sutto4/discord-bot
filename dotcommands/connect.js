const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	name: 'connect',
	description: 'Shows server connection information',
	
	async execute(message, args) {
		try {
			const embed = new EmbedBuilder()
				.setTitle('FDG Connect')
				.setURL('https://connect.fatduckgaming.com/')
				.setDescription('Direct connect to the server using one of the methods below:')
				.setAuthor({ 
					name: 'Direct Connect Links', 
					iconURL: 'https://i.imgur.com/uNdgk3H.png' 
				})
				.setThumbnail('https://i.imgur.com/uNdgk3H.png')
				.setColor(0x00b3ff)
				.addFields(
					{
						name: 'One-Click Connect',
						value: 'https://connect.fatduckgaming.com/', // UPDATE with pvp link
						inline: false
					},
					{
						name: 'Direct Connect',
						value: '<fivem://connect/3y3jjr>', // update with pvp link
						inline: false
					},
					{
						name: 'In Game',
						value: 'Press F8 to open console and type > connect deveraux-3y3jjr.users.cfx.re', // update with pvp link
						inline: false
					}
				)
				.setFooter({ 
					text: 'https://discord.gg/SrMzv6ge37 - Fat Duck Gaming FiveM Discord' 
				})
				.setTimestamp();

			// Create connect button
			const connectButton = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setLabel('🎮 One-Click Connect')
						.setStyle(ButtonStyle.Link)
						.setURL('https://connect.fatduckgaming.com/') // UPDATE with pvp link
				);

			await message.reply({ 
				embeds: [embed],
				components: [connectButton]
			});
		} catch (error) {
			console.error('Error in connect dot command:', error);
			await message.reply('❌ An error occurred while displaying the connection information.');
		}
	}
};
