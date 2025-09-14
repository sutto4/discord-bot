const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	ChannelType,
	MessageFlags
} = require('discord.js');
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
	host: process.env.BOT_DB_HOST,
	user: process.env.BOT_DB_USER,
	password: process.env.BOT_DB_PASSWORD,
	database: process.env.BOT_DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
};

async function saveModLogChannel(guildId, channelId) {
	let connection;
	try {
		connection = await mysql.createConnection(dbConfig);
		
		// First check if the guild exists
		const [guildRows] = await connection.execute(
			'SELECT guild_id FROM guilds WHERE guild_id = ?',
			[guildId]
		);
		
		if (guildRows.length === 0) {
			// Guild doesn't exist, create it with basic info
			await connection.execute(
				'INSERT INTO guilds (guild_id, guild_name, owner_id, premium) VALUES (?, ?, ?, FALSE)',
				[guildId, 'Unknown Guild', 'Unknown Owner', false]
			);
		}
		
		// Update the guilds table with the mod channel ID
		await connection.execute(
			'UPDATE guilds SET mod_channel_id = ? WHERE guild_id = ?',
			[channelId, guildId]
		);
		
		return true;
	} catch (error) {
		console.error('❌ Database error saving mod log channel:', error);
		return false;
	} finally {
		if (connection) {
			connection.end();
		}
	}
}

async function getModLogChannel(guildId) {
	let connection;
	try {
		connection = await mysql.createConnection(dbConfig);
		
		// Get the mod channel ID from the guilds table
		const [rows] = await connection.execute(
			'SELECT mod_channel_id FROM guilds WHERE guild_id = ?',
			[guildId]
		);
		
		return rows.length > 0 ? rows[0].mod_channel_id : null;
	} catch (error) {
		console.error('❌ Database error getting mod log channel:', error);
		return null;
	} finally {
		if (connection) {
			connection.end();
		}
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
		const success = await saveModLogChannel(interaction.guild.id, channel.id);
		
		if (!success) {
			return interaction.reply({
				content: '❌ Failed to save moderation log channel. Please try again.',
				flags: MessageFlags.Ephemeral
			});
		}
		
		// Check if there's also a general verify log channel
		let hasVerifyLog = false;
		try {
			const { getLogChannelId } = require('../utils/guildConfig');
			const verifyLogChannel = await getLogChannelId(interaction.guild.id);
			hasVerifyLog = verifyLogChannel ? true : false;
		} catch (err) {
			// Ignore errors reading verify log config
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
