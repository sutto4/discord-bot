const { PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/moderation');

module.exports = {
	name: 'kick',
	description: 'Kick a member',
	usage: '.kick @user [reason]',
	async execute(message, args) {
		if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
			return message.reply('You lack permission.');
		if (!args.length) return message.reply('Usage: ' + this.usage);
		const targetUser = message.mentions.users.first();
		if (!targetUser) return message.reply('Mention a user.');
		const reason = args.slice(1).join(' ') || 'No reason provided';
		const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return message.reply('Member not found.');
		if (!member.kickable) return message.reply('Cannot kick that member.');
		try {
			await member.kick(reason);
			await logModerationAction(message.guild, 'kick', message.author, member, reason);
			return message.reply(`Kicked ${targetUser.tag}.`);
		} catch {
			return message.reply('Kick failed.');
		}
	}
};
			return message.reply('Failed to kick member.');
		}
	}
};
