// config/database.js
const mysql = require('mysql2/promise');

// FiveM data lives here: accounts, accounts_groups
const fivemDb = mysql.createPool({
	host: process.env.FIVEM_DB_HOST || process.env.DB_HOST || '127.0.0.1',
	user: process.env.FIVEM_DB_USER || process.env.DB_USER || 'root',
	password: process.env.FIVEM_DB_PASSWORD || process.env.FIVEM_DB_PASS || process.env.DB_PASSWORD || '',
	database: process.env.FIVEM_DB_NAME || process.env.DB_NAME || 'fivem_live',
	port: Number(process.env.FIVEM_DB_PORT || process.env.DB_PORT || 3306),
	waitForConnections: true,
	connectionLimit: 10
});

// Bot app data lives here: guilds, guild_features
const appDb = mysql.createPool({
	host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
	user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
	password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
	database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
	port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306),
	waitForConnections: true,
	connectionLimit: 10
});

module.exports = { fivemDb, appDb };
