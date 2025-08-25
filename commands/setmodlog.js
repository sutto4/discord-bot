const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/moderation_log_channels.json');

function saveModLogChannel(guildId, channelId) {
	let data = {};
	if (fs.existsSync(configPath)) {
		try {
			data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		} catch (err) {
			console.error('❌ Failed to parse moderation_log_channels.json:', err);
			data = {};
		}
	}
	data[guildId] = channelId;
	fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function getModLogChannel(guildId) {
	if (!fs.existsSync(configPath)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return data[guildId] || null;
	} catch (err) {
		console.error('❌ Failed to read moderation_log_channels.json:', err);
		return null;
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setmodlog')
		.setDescription('Set the channel used for moderation action logs.')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The moderation log channel')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const channel = interaction.options.getChannel('channel');
		
		// Save the moderation log channel
		saveModLogChannel(interaction.guild.id, channel.id);
		
		// Check if there's also a general verify log channel
		const verifyLogPath = path.join(__dirname, '../data/verify_log_channels.json');
		let hasVerifyLog = false;
		if (fs.existsSync(verifyLogPath)) {
			try {
				const verifyData = JSON.parse(fs.readFileSync(verifyLogPath, 'utf8'));
				hasVerifyLog = verifyData[interaction.guild.id] ? true : false;
			} catch (err) {
				// Ignore errors reading verify log config
			}
		}
		
		let responseMessage = `✅ **Moderation log channel set!**\n\n`;
		responseMessage += `📝 **Moderation logs** will now be sent to <#${channel.id}>\n`;
		
		if (hasVerifyLog) {
			responseMessage += `\nℹ️ **Note:** You also have a general verify log channel configured. `;
			responseMessage += `Moderation actions will be sent to the moderation log channel.`;
		} else {
			responseMessage += `\n💡 **Tip:** You can also set a general verify log channel with \`/setverifylog\` `;
			responseMessage += `for verification and other system logs.`;
		}
		
		await interaction.reply({
			content: responseMessage,
			flags: MessageFlags.Ephemeral
		});
	},
};
