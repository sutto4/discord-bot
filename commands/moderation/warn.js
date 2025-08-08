const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	name: 'warn',
	description: 'Issue a warning to a member',
	usage: '.warn @user <reason>',

	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		if (args.length < 2) {
			return message.reply('Usage: `.warn @user <reason>`');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) {
			return message.reply('Please mention a user to warn.');
		}

		const reason = args.slice(1).join(' ');
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');

		// Try to DM the user
		try {
			await targetUser.send(`⚠️ You received a warning in **${message.guild.name}**: ${reason}`);
		} catch (error) {
			// User has DMs disabled or blocked the bot
		}

		await logModerationAction(message.guild, 'warn', message.author, member, reason);
		return message.reply(`✅ Warned ${targetUser.tag}.`);
	}
};