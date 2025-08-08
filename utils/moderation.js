const { EmbedBuilder } = require('discord.js');

function parseDuration(input) {
	if (!input) return null;
	const match = String(input).trim().match(/^(\d+)\s*([mhd])$/i);
	if (!match) return null;
	
	const value = parseInt(match[1], 10);
	const unit = match[2].toLowerCase();
	
	if (value <= 0) return null;
	
	switch (unit) {
		case 'm': return value * 60 * 1000;
		case 'h': return value * 60 * 60 * 1000;
		case 'd': return value * 24 * 60 * 60 * 1000;
		default: return null;
	}
}

async function logModerationAction(guild, action, moderatorUser, targetMember, reason, durationLabel) {
	try {
		// Get log channel from guild config
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
				{ name: 'Target', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
				{ name: 'Moderator', value: `${moderatorUser.tag} (${moderatorUser.id})`, inline: true },
				{ name: 'Reason', value: reason || 'No reason provided', inline: false }
			)
			.setTimestamp();
		
		if (durationLabel) {
			embed.addFields({ name: 'Duration', value: durationLabel, inline: true });
		}
		
		await logChannel.send({ embeds: [embed] });
	} catch (error) {
		console.error('Failed to log moderation action:', error);
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

module.exports = {
	parseDuration,
	logModerationAction
};