const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mysql = require('mysql2/promise');
const { getLogChannelId } = require('./guildConfig');

async function getDb() {
	// Replace with your existing DB client if available.
	// e.g., return require('../utils/db').pool;
	return mysql.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		database: process.env.DB_NAME,
		waitForConnections: true,
		connectionLimit: 5
	});
}

async function hasModeratorAccess(interaction, commandName) {
	const member = interaction.member;
	if (!member) return false;

	// Server admins always allowed
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

	// Fetch allowed roles for this command from DB
	const pool = await getDb();
	const [rows] = await pool.execute(
		'SELECT role_id FROM guild_mod_permissions WHERE guild_id = ? AND command_name = ?',
		[interaction.guild.id, commandName]
	);

	if (!rows.length) return false;
	const allowedRoleIds = new Set(rows.map(r => r.role_id));
	return member.roles.cache.some(r => allowedRoleIds.has(r.id));
}

function parseDuration(input) {
	if (!input) return null;
	const m = String(input).trim().match(/^(\d+)\s*([mhd])$/i);
	if (!m) return null;
	const n = parseInt(m[1], 10);
	const unit = m[2].toLowerCase();
	if (n <= 0) return null;
	switch (unit) {
		case 'm': return n * 60 * 1000;
		case 'h': return n * 60 * 60 * 1000;
		case 'd': return n * 24 * 60 * 60 * 1000;
		default: return null;
	}
}

function colorFor(action) {
	switch (action) {
		case 'kick': return 0xffa500;
		case 'warn': return 0xfff000;
		case 'mute': return 0x808080;
		case 'ban':  return 0xff0000;
		default:     return 0x2f3136;
	}
}

async function logModerationAction(guild, action, moderatorUser, targetMember, reason, durationLabel) {
	const logChannelId = await getLogChannelId(guild.id);
	if (!logChannelId) return;

	const ch = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
	if (!ch) return;

	const embed = new EmbedBuilder()
		.setTitle(`Moderation: ${action}`)
		.setColor(colorFor(action))
		.addFields(
			{ name: 'Target', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
			{ name: 'Moderator', value: `${moderatorUser.tag} (${moderatorUser.id})`, inline: true },
			{ name: 'Reason', value: reason || 'No reason provided', inline: false }
		)
		.setTimestamp();

	if (durationLabel) {
		embed.addFields({ name: 'Duration', value: durationLabel, inline: true });
	}

	await ch.send({ embeds: [embed] });
}

module.exports = {
	hasModeratorAccess,
	parseDuration,
	logModerationAction
};