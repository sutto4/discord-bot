const { PermissionFlagsBits } = require('discord.js');
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

		await targetUser.send(`⚠️ Warning in ${message.guild.name}: ${reason}`).catch(() => null);
		await logModerationAction(message.guild, 'warn', message.author, member, reason);
		return message.reply(`Warned ${targetUser.tag}.`);
	}
};
