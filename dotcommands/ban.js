const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction, buildUserDmEmbed } = require('../utils/moderation');

module.exports = {
	name: 'ban',
	description: 'Ban a member from the server',
	usage: '.ban @user [delete_days] [reason]',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}
		if (!args.length) return message.reply('Usage: ' + this.usage);

		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Mention a user.');

		let deleteDays = 0;
		let reasonStart = 1;
		if (args[1] && /^\d+$/.test(args[1])) {
			const n = parseInt(args[1], 10);
			if (n >= 0 && n <= 7) {
				deleteDays = n;
				reasonStart = 2;
			}
		}
		const reason = args.slice(reasonStart).join(' ') || 'No reason provided';
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.bannable) return message.reply('Cannot ban that member.');

		try {
			// Discord API now prefers deleteMessageSeconds (convert days -> seconds)
			const deleteMessageSeconds = deleteDays * 24 * 60 * 60;
			await member.ban({ reason, deleteMessageSeconds });
			await logModerationAction(message.guild, 'ban', message.author, member, reason);
			// DM embed to the user (best effort)
			try {
				const dmEmbed = buildUserDmEmbed('ban', message.guild.name, message.author.tag, reason, targetUser);
				await targetUser.send({ embeds: [dmEmbed] });
			} catch {}
			return message.reply(`${targetUser.tag} has been banned by ${message.author.tag} for ${reason}.`);
		} catch {
			return message.reply('Failed to ban member.');
		}
	}
};
