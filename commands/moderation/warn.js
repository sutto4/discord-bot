const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction, buildUserDmEmbed } = require('../../utils/moderation');

module.exports = {
	name: 'warn',
	description: 'Warn a user in the server.',
	args: true,
	usage: '<@user> <reason>',
	permissions: PermissionFlagsBits.ModerateMembers,

	async execute(message, args) {
		// Ensure the caller has the proper permission at runtime
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Please mention a user to warn.');
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('User not found in this guild.');

		const reason = args.slice(1).join(' ') || 'No reason provided';

		// DM embed to the warned user
		try {
			const embed = buildUserDmEmbed('warn', message.guild.name, message.author.tag, reason, targetUser);
			await targetUser.send({ embeds: [embed] });
		} catch {
			// User has DMs disabled or blocked the bot
		}

		await logModerationAction(message.guild, 'warn', message.author, member, reason);
		return message.reply(`${targetUser.tag} has been warned by ${message.author.tag} for ${reason}.`);
	}
};