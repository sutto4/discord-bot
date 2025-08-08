const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	name: 'kick',
	description: 'Kick a member from the server',
	usage: '.kick @user [reason]',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		if (args.length < 1) {
			return message.reply('Usage: `.kick @user [reason]`');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) {
			return message.reply('Please mention a user to kick.');
		}

		const reason = args.slice(1).join(' ') || 'No reason provided';
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.kickable) return message.reply('I cannot kick this member.');

		try {
			await member.kick(reason);
			await logModerationAction(message.guild, 'kick', message.author, member, reason);
			return message.reply(`✅ Kicked ${targetUser.tag}.`);
		} catch (error) {
			return message.reply('Failed to kick member.');
		}
	}
};