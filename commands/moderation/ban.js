const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	name: 'ban',
	description: 'Ban a member from the server',
	usage: '.ban @user [delete_days] [reason]',
	
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		if (args.length < 1) {
			return message.reply('Usage: `.ban @user [delete_days] [reason]`');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) {
			return message.reply('Please mention a user to ban.');
		}

		// Check if second arg is a number (delete days)
		let deleteDays = 0;
		let reasonStart = 1;
		
		if (args[1] && !isNaN(args[1]) && parseInt(args[1]) >= 0 && parseInt(args[1]) <= 7) {
			deleteDays = parseInt(args[1]);
			reasonStart = 2;
		}

		const reason = args.slice(reasonStart).join(' ') || 'No reason provided';
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.bannable) return message.reply('I cannot ban this member.');

		try {
			await member.ban({ reason, deleteMessageDays: deleteDays });
			await logModerationAction(message.guild, 'ban', message.author, member, reason);
			return message.reply(`✅ Banned ${targetUser.tag}.`);
		} catch (error) {
			return message.reply('Failed to ban member.');
		}
	}
};