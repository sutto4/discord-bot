const { PermissionFlagsBits } = require('discord.js');
const { parseDuration, logModerationAction } = require('../utils/moderation');

module.exports = {
	name: 'mute',
	description: 'Timeout a member',
	usage: '.mute @user <duration> [reason]',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
			return message.reply('You lack permission.');
		if (args.length < 2) return message.reply('Usage: ' + this.usage);
		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Mention a user.');
		const durationStr = args[1];
		const ms = parseDuration(durationStr);
		if (!ms) return message.reply('Invalid duration. Use 10m / 2h / 1d / 30s.');
		const reason = args.slice(2).join(' ') || 'No reason provided';
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.moderatable) return message.reply('Cannot mute that member.');
		await member.timeout(ms, reason).catch(() => null);
		await logModerationAction(message.guild, 'mute', message.author, member, reason, durationStr);
		return message.reply(`Muted ${targetUser.tag} for ${durationStr}.`);
	}
};
