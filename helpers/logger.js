const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/verify_log_channels.json');

function getLogChannelId(guildId) {
	if (!fs.existsSync(configPath)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return data[guildId] || null;
	} catch (err) {
		console.error('Failed to read verify_log_channels.json:', err);
		return null;
	}
}

async function logToChannel(guild, message, embed = null) {
	const logChannelId = getLogChannelId(guild.id);
	if (!logChannelId) return;

	try {
		const logChannel = guild.channels.cache.get(logChannelId);
		if (logChannel) {
			const messageOptions = { content: message };
			if (embed) {
				messageOptions.embeds = [embed];
			}
			await logChannel.send(messageOptions);
		}
	} catch (err) {
		console.error('Error logging to channel:', err);
	}
}

module.exports = {
	getLogChannelId,
	logToChannel
};
