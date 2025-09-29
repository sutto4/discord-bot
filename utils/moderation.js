const { EmbedBuilder } = require('discord.js');
const { logAction } = require('../helpers/systemLogger');

function parseDuration(input) {
	if (!input) return null;
	const match = String(input).trim().match(/^(\d+)\s*([smhd])$/i); // allow seconds 's'
	if (!match) return null;
	const value = parseInt(match[1], 10);
	const unit = match[2].toLowerCase();
	if (value <= 0) return null;
	switch (unit) {
		case 's': return value * 1000;
		case 'm': return value * 60 * 1000;
		case 'h': return value * 60 * 60 * 1000;
		case 'd': return value * 24 * 60 * 60 * 1000;
		default: return null;
	}
}

function sanitize(text, fallback = 'N/A') {
	const v = (text ?? '').toString().trim();
	return v.length ? (v.length > 900 ? v.slice(0, 897) + '...' : v) : fallback;
}

async function logModerationAction(guild, action, moderatorUser, targetMember, reason, durationLabel, caseId = null) {
	try {
		// First try to get moderation-specific log channel from database
		let logChannelId = null;

		// Check for moderation log channel first
		try {
			const mysql = require('mysql2/promise');
			const dbConfig = {
				host: process.env.BOT_DB_HOST,
				user: process.env.BOT_DB_USER,
				password: process.env.BOT_DB_PASSWORD,
				database: process.env.BOT_DB_NAME,
				waitForConnections: true,
				connectionLimit: 10,
				queueLimit: 0
			};

			const connection = await mysql.createConnection(dbConfig);
			const [rows] = await connection.execute(
				'SELECT mod_channel_id FROM guilds WHERE guild_id = ?',
				[guild.id]
			);
			connection.end();

			if (rows.length > 0 && rows[0].mod_channel_id) {
				logChannelId = rows[0].mod_channel_id;
			}
		} catch (err) {
			console.error('Failed to get mod log channel from database:', err);
		}

		// Fall back to general verify log channel if no moderation log channel is set
		if (!logChannelId) {
			const { getLogChannelId } = require('./guildConfig');
			logChannelId = await getLogChannelId(guild.id);
		}

		if (!logChannelId) return;

		const logChannel = guild.channels.cache.get(logChannelId) ||
			await guild.channels.fetch(logChannelId).catch(() => null);
		if (!logChannel) return;

		// Log to database and get case details
		let caseId = null;
		let caseDbId = null;

		try {
			const ModerationDatabase = require('./moderation-db');
			const modDb = new ModerationDatabase();

			// Prepare data for database logging
			const logData = {
				guildId: guild.id,
				actionType: action,
				targetUserId: targetMember?.id || 'Unknown',
				targetUsername: targetMember?.user?.tag || targetMember?.tag || 'Unknown',
				moderatorUserId: moderatorUser?.id || 'Unknown',
				moderatorUsername: moderatorUser?.tag || 'Unknown',
				reason: reason || 'No reason provided',
				durationMs: parseDuration(durationLabel) || null,
				durationLabel: durationLabel || null,
				active: action === 'mute' || action === 'ban', // Active for temporary actions
				expiresAt: null
			};

			// Calculate expiration for temporary actions
			if (logData.durationMs && (action === 'mute' || action === 'ban')) {
				logData.expiresAt = new Date(Date.now() + logData.durationMs);
			}

			const result = await modDb.logModerationAction(logData);
			caseId = result?.caseId;
			caseDbId = result?.caseId_db;

		} catch (dbError) {
			console.error('Failed to log moderation action to database:', dbError);
		}

		const targetValue = targetMember
			? `<@${targetMember.id}> (${sanitize(targetMember.user.tag)})`
			: 'Unknown';
		const modValue = moderatorUser
			? `<@${moderatorUser.id}> (${sanitize(moderatorUser.tag)})`
			: 'Unknown';

		const embed = new EmbedBuilder()
			.setTitle(`🔨 Moderation: ${action.toUpperCase()}`)
			.setColor(getActionColor(action))
			.addFields(
				{ name: 'Target', value: targetValue, inline: true },
				{ name: 'Moderator', value: modValue, inline: true },
				{ name: 'Reason', value: sanitize(reason, 'No reason provided'), inline: false }
			)
			.setTimestamp();

		if (durationLabel) {
			embed.addFields({ name: 'Duration', value: sanitize(durationLabel), inline: true });
		}

		// Add case ID with web app link if we have one
		if (caseId) {
			const webAppUrl = process.env.CCC_WEB_APP_URL || 'https://servermate.gg';
			const caseUrl = `${webAppUrl}/guilds/${guild.id}/moderation?case=${caseId}`;

			console.log('[MODERATION] Generated case link:', {
				caseId,
				webAppUrl,
				caseUrl,
				guildId: guild.id
			});

			embed.addFields({
				name: 'Case Details',
				value: `[📱 View Case Details](${caseUrl})`,
				inline: false
			});
		} else {
			console.log('[MODERATION] No caseId generated for moderation action');
		}

		await logChannel.send({ embeds: [embed] }).catch(() => null);

		// Log moderation action to system logs
		logAction(
			guild,
			moderatorUser,
			`moderation_${action}`,
			{
				action,
				targetUserId: targetMember?.id,
				targetUsername: targetMember?.user?.tag || targetMember?.tag,
				reason,
				durationLabel,
				caseId
			},
			'success'
		).catch(() => {});
	} catch (err) {
		console.error('Failed to log moderation action:', err);
		
		// Log failed moderation action to system logs
		logAction(
			guild,
			moderatorUser,
			`moderation_${action}`,
			{
				action,
				targetUserId: targetMember?.id,
				targetUsername: targetMember?.user?.tag || targetMember?.tag,
				reason,
				durationLabel,
				caseId
			},
			'failed',
			err?.message?.slice(0, 500)
		).catch(() => {});
	}
}


function getActionColor(action) {
	switch (action) {
		case 'kick': return 0xFFA500;
		case 'warn': return 0xFFFF00;
		case 'mute': return 0x808080;
		case 'ban': return 0xFF0000;
		case 'unban': return 0x00FF00;
		case 'unmute': return 0x0000FF;
		default: return 0x2F3136;
	}
}

function buildUserDmEmbed(action, guildName, moderatorTag, reason, targetUser, extraFields = []) {
	const actionTitle = {
		warn: 'Warning Issued',
		kick: 'You Were Kicked',
		mute: 'You Were Muted',
		ban: 'You Were Banned'
	}[action] || 'Moderation Notice';

	const color = {
		warn: 0xFFFF00,
		kick: 0xFFA500,
		mute: 0x808080,
		ban: 0xFF0000
	}[action] || 0x2F3136;

	const embed = new EmbedBuilder()
		.setTitle(actionTitle)
		.setColor(color)
		.setDescription(`An action was taken against your account in ${guildName}.`)
		.addFields(
			{ name: 'Moderator', value: `${moderatorTag}`, inline: true },
			{ name: 'Reason', value: reason || 'No reason provided', inline: false }
		)
		.setThumbnail(targetUser?.displayAvatarURL?.({ size: 128 }) || null)
		.setTimestamp();

	if (Array.isArray(extraFields) && extraFields.length) {
		embed.addFields(...extraFields);
	}

	return embed;
}

module.exports = {
	parseDuration,
	logModerationAction,
	buildUserDmEmbed
};