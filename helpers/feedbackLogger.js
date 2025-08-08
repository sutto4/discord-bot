const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/feedback_channels.json');

function getFeedbackChannelId(guildId) {
	if (!fs.existsSync(configPath)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return data[guildId] || null;
	} catch (err) {
		console.error('Failed to read feedback_channels.json:', err);
		return null;
	}
}

async function logFeedbackToChannel(guild, message, embed = null) {
	const feedbackChannelId = getFeedbackChannelId(guild.id);
	if (!feedbackChannelId) {
		console.log('No feedback channel configured for guild:', guild.id);
		return false;
	}

	try {
		const feedbackChannel = guild.channels.cache.get(feedbackChannelId);
		if (feedbackChannel) {
			const messageOptions = { content: message };
			if (embed) {
				messageOptions.embeds = [embed];
			}
			await feedbackChannel.send(messageOptions);
			return true;
		} else {
			console.log('Feedback channel not found:', feedbackChannelId);
			return false;
		}
	} catch (err) {
		console.error('Error logging feedback to channel:', err);
		return false;
	}
}

module.exports = {
	getFeedbackChannelId,
	logFeedbackToChannel
};
