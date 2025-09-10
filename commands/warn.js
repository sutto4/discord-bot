const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a user (no action taken)')
		.addUserOption(option => 
			option.setName('user')
				.setDescription('The user to warn')
				.setRequired(true))
		.addStringOption(option => 
			option.setName('reason')
				.setDescription('Reason for the warning')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

	async execute(interaction) {
		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason') || 'No reason provided';

		try {
			// Fetch the member object for logging
			const member = await interaction.guild.members.fetch(user.id);
			
			// Create case ID
			const caseId = await generateCaseId(interaction.guildId);

			// Log to Discord channel and database
			const { logModerationAction: logToChannel } = require('../utils/moderation');
			await logToChannel(
				interaction.guild,
				'warn',
				interaction.user,
				member,
				reason,
				null, // no duration for warns
				caseId
			);

			// Log to database
			const ModerationDatabase = require('../utils/moderation-db');
			const modDb = new ModerationDatabase();

			try {
				console.log('Attempting to log moderation action to database...');
				console.log('Database config:', {
					host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
					user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
					database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
					port: process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306,
					hasPassword: !!(process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD)
				});

				// Test database connection first
				console.log('Testing database connection...');
				const testConnection = await modDb.pool.getConnection();
				console.log('Database connection successful');
				testConnection.release();

				console.log('Data being sent to database:', {
					guildId: interaction.guildId,
					guildIdLength: interaction.guildId.length,
					caseId,
					caseIdLength: caseId.length,
					targetUserId: user.id,
					targetUsername: user.tag,
					moderatorUserId: interaction.user.id,
					moderatorUsername: interaction.user.tag,
					reason
				});

				const result = await modDb.logModerationAction({
					guildId: interaction.guildId,
					caseId,
					actionType: 'warn',
					targetUserId: user.id,
					targetUsername: user.tag,
					moderatorUserId: interaction.user.id,
					moderatorUsername: interaction.user.tag,
					reason,
					durationMs: null,
					durationLabel: null,
					active: false,
					expiresAt: null
				});

				console.log('Moderation action logged to database successfully:', {
					guildId: interaction.guildId,
					caseId,
					actionType: 'warn',
					targetUserId: user.id,
					targetUsername: user.tag,
					moderatorUserId: interaction.user.id,
					moderatorUsername: interaction.user.tag,
					reason,
					databaseResult: result
				});
			} catch (dbError) {
				console.error('Failed to log moderation action to database:', {
					error: dbError.message,
					stack: dbError.stack,
					code: dbError.code,
					sqlState: dbError.sqlState
				});
				// Don't fail the command if database logging fails
			}

			// Try to DM the warned user
			try {
				const dmEmbed = new EmbedBuilder()
					.setColor('#FFD700')
					.setTitle('⚠️ You have been warned')
					.setDescription(`You have been warned in **${interaction.guild.name}**`)
					.addFields(
						{ name: 'Reason', value: reason, inline: false },
						{ name: 'Moderator', value: interaction.user.tag, inline: true },
						{ name: 'Case ID', value: caseId, inline: true }
					)
					.setThumbnail(user.displayAvatarURL())
					.setTimestamp();

				await user.send({ embeds: [dmEmbed] });
			} catch (dmError) {
				// User has DMs disabled, ignore
			}

			// Send ephemeral reply to the command user (only they can see it)
			const replyEmbed = new EmbedBuilder()
				.setColor('#FFD700')
				.setTitle('✅ Warning Sent')
				.setDescription(`**${user.tag}** has been warned`)
				.addFields(
					{ name: 'Reason', value: reason, inline: true },
					{ name: 'Case ID', value: caseId, inline: true }
				)
				.setTimestamp();

			await interaction.reply({ 
				embeds: [replyEmbed], 
				flags: MessageFlags.Ephemeral
			});

		} catch (error) {
			console.error('Error warning user:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while trying to warn the user.', 
				flags: MessageFlags.Ephemeral
			});
		}
	},
};

async function generateCaseId(guildId) {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 1000);
	return `${guildId}-${timestamp}-${random}`;
}

async function logModerationAction(data) {
	console.log('Moderation action logged:', data);
}
