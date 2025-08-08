const mysql = require('mysql2/promise');

let pool;
async function getDb() {
	if (!pool) {
		pool = await mysql.createPool({
			host: process.env.DB_HOST,
			user: process.env.DB_USER,
			password: process.env.DB_PASS,
			database: process.env.DB_NAME,
			waitForConnections: true,
			connectionLimit: 5
		});
	}
	return pool;
}

async function getLogChannelId(guildId) {
	const db = await getDb();
	const [rows] = await db.execute(
		'SELECT log_channel_id FROM guilds WHERE guild_id = ? LIMIT 1',
		[guildId]
	);
	return rows?.[0]?.log_channel_id || null;
}

module.exports = {
	getLogChannelId
};