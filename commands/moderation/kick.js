const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction, buildUserDmEmbed } = require('../../utils/moderation');

module.exports = {
	name: 'kick',
	description: 'Kick a member from the server',
	usage: '.kick @user [reason]',
	permissions: PermissionFlagsBits.ModerateMembers,

	async execute(message, args) {
		// Ensure the caller has the proper permission at runtime
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Please mention a user to kick.');
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('User not found in this guild.');

		const reason = args.slice(1).join(' ') || 'No reason provided';

		try {
			await member.kick(reason);
			// DM embed to the user
			try {
				const dmEmbed = buildUserDmEmbed('kick', message.guild.name, message.author.tag, reason, targetUser);
				await targetUser.send({ embeds: [dmEmbed] });
			} catch {}
			await logModerationAction(message.guild, 'kick', message.author, member, reason);
			return message.reply(`${targetUser.tag} has been kicked by ${message.author.tag} for ${reason}.`);
		} catch {
			return message.reply('Failed to kick member.');
		}
	}
};