const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Config file paths
const verifyLogPath = path.join(__dirname, '../data/verify_log_channels.json');
const feedbackPath = path.join(__dirname, '../data/feedback_channels.json');
const rolesPath = path.join(__dirname, '../config/roles.js');

function readConfig(filePath) {
	if (!fs.existsSync(filePath)) return {};
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (err) {
		console.error(`Failed to read ${filePath}:`, err);
		return {};
	}
}

function writeConfig(filePath, data) {
	const dataDir = path.dirname(filePath);
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getCurrentConfig(guildId) {
	const verifyLogs = readConfig(verifyLogPath);
	const feedbackChannels = readConfig(feedbackPath);
	
	return {
		verifyLogChannel: verifyLogs[guildId] || 'Not set',
		feedbackChannel: feedbackChannels[guildId] || 'Not set',
		verifyRoleId: process.env.VERIFY_ROLE_ID || 'Not set',
		syncInterval: '720' // Default from bot.js
	};
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('config')
		.setDescription('Configure bot settings for this server'),
	
	async execute(interaction) {
		// Check if user has permission to manage server
		if (!interaction.member.permissions.has('ManageGuild')) {
			return await interaction.reply({
				content: '❌ You need the "Manage Server" permission to use this command.',
				ephemeral: true
			});
		}

		const currentConfig = getCurrentConfig(interaction.guild.id);
		
		// Create configuration overview embed
		const configEmbed = new EmbedBuilder()
			.setTitle('⚙️ Server Configuration')
			.setDescription('Current bot settings for this server')
			.setColor(0x5865F2)
			.addFields(
				{
					name: '📝 Verify Log Channel',
					value: currentConfig.verifyLogChannel === 'Not set' ? '❌ Not configured' : `<#${currentConfig.verifyLogChannel}>`,
					inline: true
				},
				{
					name: '💬 Feedback Channel',
					value: currentConfig.feedbackChannel === 'Not set' ? '❌ Not configured' : `<#${currentConfig.feedbackChannel}>`,
					inline: true
				},
				{
					name: '🎭 Verify Role',
					value: currentConfig.verifyRoleId === 'Not set' ? '❌ Not configured' : `<@&${currentConfig.verifyRoleId}>`,
					inline: true
				},
				{
					name: '⏰ Sync Interval',
					value: `${currentConfig.syncInterval} minutes`,
					inline: true
				},
				{
					name: '📋 Quick Actions',
					value: 'Use the buttons below to configure individual settings',
					inline: false
				}
			)
			.setFooter({ text: 'Click a button below to configure that setting' })
			.setTimestamp();

		// Create action buttons
		const configButtons = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('config_channels')
					.setLabel('📝 Configure Channels')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('config_roles')
					.setLabel('🎭 Configure Roles')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('config_sync')
					.setLabel('⏰ Configure Sync')
					.setStyle(ButtonStyle.Secondary)
			);

		await interaction.reply({
			embeds: [configEmbed],
			components: [configButtons],
			ephemeral: true
		});
	},
};
