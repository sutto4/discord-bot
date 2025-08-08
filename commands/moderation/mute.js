const { PermissionFlagsBits } = require('discord.js');
const { parseDuration, logModerationAction, buildUserDmEmbed } = require('../../utils/moderation');

module.exports = {
	name: 'mute',
	description: 'Timeout a member',
	usage: '.mute @user <duration> [reason]',
	async execute(message, args) {
		// Ensure the caller has the proper permission at runtime
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			return message.reply('You do not have permission for this command.');
		}

		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Please mention a user to mute.');
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('User not found in this guild.');

		const durationStr = args[1];
		const reason = args.slice(2).join(' ') || 'No reason provided';

		// Parse the duration
		const ms = parseDuration(durationStr);
		if (ms === null) return message.reply('Invalid duration format. Use \`<number><s/m/h/d>\`.');

		// Apply the timeout
		await member.timeout(ms, reason).catch(() => null);

		// DM embed to the user
		try {
			const dmEmbed = buildUserDmEmbed(
				'mute',
				message.guild.name,
				message.author.tag,
				reason,
				targetUser,
				[{ name: 'Duration', value: durationStr, inline: true }]
			);
			await targetUser.send({ embeds: [dmEmbed] });
		} catch {}

		await logModerationAction(message.guild, 'mute', message.author, member, reason, durationStr);
		return message.reply(`<@${targetUser.id}> has been muted by <@${message.author.id}> for ${durationStr} for ${reason}.`);
	}
};