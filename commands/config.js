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

async function getCurrentConfig(guildId) {
	try {
		const { query } = require('../config/database-multi-guild');
		const [rows] = await query(
			`SELECT verify_channel_id, feedback_channel_id, verify_role_id FROM guilds WHERE guild_id = ?`,
			[guildId]
		);
		
		console.log('Database query result for guild', guildId, ':', rows);
		
		if (rows.length > 0) {
			const config = rows[0];
			console.log('Config values:', config);
			return {
				verifyLogChannel: config.verify_channel_id ? `<#${config.verify_channel_id}>` : 'Not set',
				feedbackChannel: config.feedback_channel_id ? `<#${config.feedback_channel_id}>` : 'Not set',
				verifyRoleId: config.verify_role_id ? `<@&${config.verify_role_id}>` : 'Not set'
			};
		}
		
		return {
			verifyLogChannel: 'Not set',
			feedbackChannel: 'Not set',
			verifyRoleId: 'Not set'
		};
	} catch (error) {
		console.error('Error fetching config from database:', error);
		console.error('Guild ID:', guildId);
		return {
			verifyLogChannel: 'Database error',
			feedbackChannel: 'Database error',
			verifyRoleId: 'Database error'
		};
	}
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
				flags: 64
			});
		}

		const currentConfig = await getCurrentConfig(interaction.guild.id);
		
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
					name: '🌐 Web Dashboard',
					value: `[Open Server Settings](${process.env.CCC_WEB_APP_URL || 'http://localhost:3000'}/guilds/${interaction.guild.id}/settings)`,
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
					.setStyle(ButtonStyle.Secondary)
			);

		await interaction.reply({
			embeds: [configEmbed],
			components: [configButtons],
			flags: 64
		});
	},
};
