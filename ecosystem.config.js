module.exports = {
  apps: [{
    name: 'discord-bot',
    script: 'bot.js',
    cwd: '/home/discordbot/bot',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/discordbot/logs/err.log',
    out_file: '/home/discordbot/logs/out.log',
    log_file: '/home/discordbot/logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
