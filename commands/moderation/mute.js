const { PermissionFlagsBits } = require('discord.js');
const { parseDuration, logModerationAction } = require('../../utils/moderation');

module.exports = {
	name: 'mute',
	description: 'Timeout a member',
	usage: '.mute @user <duration> [reason]',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		if (args.length < 2) {
			return message.reply('Usage: `.mute @user <duration> [reason]`');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) {
			return message.reply('Please mention a user to mute.');
		}

		const durationStr = args[1];
		const reason = args.slice(2).join(' ') || 'No reason provided';

		const ms = parseDuration(durationStr);
		if (!ms) return message.reply('Invalid duration. Use formats like 10m, 2h, 1d.');

		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.moderatable) return message.reply('I cannot mute this member.');

		await member.timeout(ms, reason).catch(() => null);
		await logModerationAction(message.guild, 'mute', message.author, member, reason, durationStr);
		return message.reply(`✅ Muted ${targetUser.tag} for ${durationStr}.`);
	}
};