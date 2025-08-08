require('dotenv').config();
const mysql = require('mysql2/promise');

// FiveM Database (external integration - uses sutto credentials)
const fivemDb = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT || 3306,
});

// Bot Database (internal operations - uses dedicated chester_bot user)
const botDb = mysql.createPool({
	host: process.env.BOT_DB_HOST,
	user: process.env.BOT_DB_USER,
	password: process.env.BOT_DB_PASSWORD,
	database: process.env.BOT_DB_NAME,
	port: process.env.BOT_DB_PORT || 3306,
});

module.exports = { fivemDb, botDb };