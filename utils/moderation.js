const { EmbedBuilder } = require('discord.js');

function parseDuration(input) {
	if (!input) return null;
	const match = String(input).trim().match(/^(\d+)\s*([smhd])$/i); // allow seconds 's'
	if (!match) return null;
	const value = parseInt(match[1], 10);
	const unit = match[2].toLowerCase();
	if (value <= 0) return null;
	switch (unit) {
		case 's': return value * 1000;
		case 'm': return value * 60 * 1000;
		case 'h': return value * 60 * 60 * 1000;
		case 'd': return value * 24 * 60 * 60 * 1000;
		default: return null;
	}
}

function sanitize(text, fallback = 'N/A') {
	const v = (text ?? '').toString().trim();
	return v.length ? (v.length > 900 ? v.slice(0, 897) + '...' : v) : fallback;
}

async function logModerationAction(guild, action, moderatorUser, targetMember, reason, durationLabel) {
	try {
		const { getLogChannelId } = require('./guildConfig');
		const logChannelId = await getLogChannelId(guild.id);
		if (!logChannelId) return;
		const logChannel = guild.channels.cache.get(logChannelId) ||
			await guild.channels.fetch(logChannelId).catch(() => null);
		if (!logChannel) return;
		const embed = new EmbedBuilder()
			.setTitle(`🔨 Moderation: ${action.toUpperCase()}`)
			.setColor(getActionColor(action))
			.addFields(
				{
					name: 'Target',
					value: targetMember
						? `${sanitize(targetMember.user.tag)} (${targetMember.id})`
						: 'Unknown',
					inline: true
				},
				{
					name: 'Moderator',
					value: moderatorUser
						? `${sanitize(moderatorUser.tag)} (${moderatorUser.id})`
						: 'Unknown',
					inline: true
				},
				{ name: 'Reason', value: sanitize(reason, 'No reason provided'), inline: false }
			)
			.setTimestamp();
		if (durationLabel) {
			embed.addFields({ name: 'Duration', value: sanitize(durationLabel), inline: true });
		}
		await logChannel.send({ embeds: [embed] }).catch(() => null);
	} catch (err) {
		console.error('Failed to log moderation action:', err);
	}
}

function getActionColor(action) {
	switch (action) {
		case 'kick': return 0xFFA500;
		case 'warn': return 0xFFFF00;
		case 'mute': return 0x808080;
		case 'ban': return 0xFF0000;
		default: return 0x2F3136;
	}
}

function buildUserDmEmbed(action, guildName, moderatorTag, reason, targetUser, extraFields = []) {
	const actionTitle = {
		warn: 'Warning Issued',
		kick: 'You Were Kicked',
		mute: 'You Were Muted',
		ban: 'You Were Banned'
	}[action] || 'Moderation Notice';

	const color = {
		warn: 0xFFFF00,
		kick: 0xFFA500,
		mute: 0x808080,
		ban: 0xFF0000
	}[action] || 0x2F3136;

	const embed = new EmbedBuilder()
		.setTitle(actionTitle)
		.setColor(color)
		.setDescription(`An action was taken against your account in ${guildName}.`)
		.addFields(
			{ name: 'Moderator', value: `${moderatorTag}`, inline: true },
			{ name: 'Reason', value: reason || 'No reason provided', inline: false }
		)
		.setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null)
		.setTimestamp();

	if (Array.isArray(extraFields) && extraFields.length) {
		embed.addFields(...extraFields);
	}

	return embed;
}

module.exports = {
	parseDuration,
	logModerationAction,
	buildUserDmEmbed
};