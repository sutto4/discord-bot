const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/feedback_channels.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setfeedbackchannel')
		.setDescription('Set the channel where feedback submissions will be sent')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The channel to send feedback to')
				.setRequired(true)),
	async execute(interaction) {
		// Check if user has permission to manage channels
		if (!interaction.member.permissions.has('ManageChannels')) {
			return await interaction.reply({
				content: '❌ You need the "Manage Channels" permission to use this command.',
				ephemeral: true
			});
		}

		const channel = interaction.options.getChannel('channel');
		
		// Verify it's a text channel
		if (channel.type !== 0) { // 0 = GUILD_TEXT
			return await interaction.reply({
				content: '❌ Please select a text channel.',
				ephemeral: true
			});
		}

		try {
			// Create data directory if it doesn't exist
			const dataDir = path.dirname(configPath);
			if (!fs.existsSync(dataDir)) {
				fs.mkdirSync(dataDir, { recursive: true });
			}

			// Read existing config or create new
			let config = {};
			if (fs.existsSync(configPath)) {
				const data = fs.readFileSync(configPath, 'utf8');
				config = JSON.parse(data);
			}

			// Update config for this guild
			config[interaction.guild.id] = channel.id;

			// Write config back to file
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

			await interaction.reply({
				content: `✅ Feedback channel set to ${channel}. All feedback submissions will now be sent there.`,
				ephemeral: true
			});

		} catch (error) {
			console.error('Error setting feedback channel:', error);
			await interaction.reply({
				content: '❌ An error occurred while setting the feedback channel.',
				ephemeral: true
			});
		}
	},
};
