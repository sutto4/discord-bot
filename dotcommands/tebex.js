const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	name: 'tebex',
	description: 'Shows Tebex store information',
	
	async execute(message, args) {
		try {
			const embed = new EmbedBuilder()
				.setTitle('🛒 Tebex Information for supporting the server')
				.setDescription('**Want to skip the queue?**\n\nSupport our community and keep that blinky light on our servers by supporting us at https://donate.fatduckgaming.com/\n\u200B')
				.setThumbnail('https://i.imgur.com/uNdgk3H.png')
				.setColor(0x5865F2)
				.addFields(
					{
						name: '📦 Available Packages',
						value: 'There are **3 packages** available on our Tebex Platform and each skip the previous in the queue, **Fat Duck Family** also provides access to reserved slots on our server for those busy nights!\n\u200B',
						inline: false
					},
					{
						name: '⚠️ Important Notice',
						value: 'Please note that **Fat Duck Family** is the highest donation tier we accept and to be aware that your support is subject to the [Donation terms and conditions](https://donate.fatduckgaming.com/terms/)\n\u200B',
						inline: false
					},
					{
						name: '🔗 How do I link it up?',
						value: 'When you donate through Tebex you will link your **FiveM CFX account** and that is how it will track any benefits we allocate to that account, you will also be prompted to link your **Discord** where you will keep your fancy roles',
						inline: false
					}
				)
				.setTimestamp();

			// Create donation button
			const donationButton = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setLabel('💰 Donate Now')
						.setStyle(ButtonStyle.Link)
						.setURL('https://donate.fatduckgaming.com/')
				);

			await message.reply({ 
				embeds: [embed],
				components: [donationButton]
			});
		} catch (error) {
			console.error('Error in tebex dot command:', error);
			await message.reply('❌ An error occurred while displaying the Tebex information.');
		}
	}
};
