const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logModerationAction } = require('../utils/moderation');

module.exports = {
	name: 'warn',
	description: 'Issue a warning to a member',
	usage: '.warn @user <reason>',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You lack permission.');
		}
		if (args.length < 2) return message.reply('Usage: ' + this.usage);

		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Mention a user.');

		const reason = args.slice(1).join(' ');
		if (!reason) return message.reply('Provide a reason.');

		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');

		// Try to DM the user with an embed
		const embed = new EmbedBuilder()
			.setTitle('Warning Issued')
			.setColor(0xFFFF00)
			.setDescription(`You have been warned in ${message.guild.name}.`)
			.addFields(
				{ name: 'Moderator', value: `${message.author.tag}`, inline: true },
				{ name: 'Reason', value: reason, inline: false }
			)
			.setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
			.setTimestamp();
		try {
			await targetUser.send({ embeds: [embed] });
		} catch (error) {
			return message.reply('Unable to send DM to the user.');
		}

		await logModerationAction(message.guild, 'warn', message.author, member, reason);
		return message.reply(`${targetUser.tag} has been warned by ${message.author.tag} for ${reason}.`);
	}
};
