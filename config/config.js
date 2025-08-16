module.exports = {
  // Bot Configuration
  bot: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  
  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    cors: {
      origin: [
        'https://servermate.gg',
        'https://www.servermate.gg',
        'https://servermate.app',
        'https://www.servermate.app'
      ],
      credentials: true
    }
  },
  
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chester_bot',
    port: process.env.DB_PORT || 3306
  },
  
  // SSL Configuration (if using self-signed for internal communication)
  ssl: {
    enabled: process.env.SSL_ENABLED === 'true',
    key: process.env.SSL_KEY_PATH,
    cert: process.env.SSL_CERT_PATH
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || '/var/log/servermate-bot.log'
  }
};
