const mysql = require('mysql2/promise');

// ...existing code...
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

async function getLogChannelId(guildId) {
	// Replace this with your existing config table/column if different.
	const pool = await getDb();
	const [rows] = await pool.execute(
		'SELECT log_channel_id FROM guilds WHERE guild_id = ? LIMIT 1',
		[guildId]
	);
	return rows?.[0]?.log_channel_id || null;
}

module.exports = {
	getLogChannelId
};