const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/verify_log_channels.json');

function saveChannel(guildId, channelId) {
	let data = {};
	if (fs.existsSync(configPath)) {
		try {
			data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		} catch (err) {
			console.error('❌ Failed to parse verify_log_channels.json:', err);
			data = {};
		}
	}
	data[guildId] = channelId;
	fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setverifylog')
		.setDescription('Set the channel where verification attempts will be logged.')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The log channel')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const channel = interaction.options.getChannel('channel');
		saveChannel(interaction.guild.id, channel.id);
		await interaction.reply({
            content: `✅ Verification logs will now go to <#${channel.id}>`,
            ephemeral: true // ✅ Ephemeral
        });
	}
};