const { EmbedBuilder } = require('discord.js');

module.exports = {
	name: 'server',
	description: 'Shows server information and statistics',
	
	async execute(message, args) {
		try {
			const guild = message.guild;
			
			const embed = new EmbedBuilder()
				.setTitle(`🏠 ${guild.name} Server Information`)
				.setThumbnail(guild.iconURL())
				.setColor(0x5865F2)
				.addFields(
					{ name: '👥 Total Members', value: `${guild.memberCount}`, inline: true },
					{ name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
					{ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
					{ name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
					{ name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true },
					{ name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true }
				)
				.setFooter({ text: `Server ID: ${guild.id}` })
				.setTimestamp();

			await message.reply({ embeds: [embed] });

		} catch (error) {
			console.error('Error in server command:', error);
			await message.reply('❌ An error occurred while fetching server information.');
		}
	}
};
