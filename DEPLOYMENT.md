# VPS Deployment Guide

## Step 1: Run the Setup Script

Upload `deploy.sh` to your VPS and run:
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

## Step 2: Upload Your Bot Files

From your local machine, upload your bot files:
```bash
# Using SCP (replace YOUR_VPS_IP)
scp -r ./discord-bot root@YOUR_VPS_IP:/home/discordbot/bot/

# Or use SFTP client like FileZilla
```

## Step 3: Create Environment File

On your VPS, create the .env file:
```bash
sudo -u discordbot nano /home/discordbot/bot/.env
```

Add your configuration:
```env
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id
GUILD_IDS=guild1,guild2,guild3

# Database
DB_HOST=localhost
DB_USER=botuser
DB_PASS=your_secure_password_here
DB_NAME=discord_bot

# Tebex API
TEBEX_SECRET=your_tebex_secret_here

# Role IDs
VERIFY_ROLE_ID=your_verify_role_id
TIER1_ROLE_ID=your_tier1_role_id
TIER2_ROLE_ID=your_tier2_role_id
TIER3_ROLE_ID=your_tier3_role_id
```

## Step 4: Install Dependencies and Start Bot

```bash
# Switch to bot user
sudo su - discordbot

# Go to bot directory
cd /home/discordbot/bot

# Install dependencies
npm install

# Deploy commands to Discord
node deploy-commands.js

# Start bot with PM2
pm2 start bot.js --name discord-bot

# Make PM2 start on boot
pm2 startup
pm2 save
```

## Step 5: Verify Everything is Working

```bash
# Check bot status
pm2 status

# View bot logs
pm2 logs discord-bot

# Restart bot if needed
pm2 restart discord-bot
```

## Useful Commands

```bash
# View bot logs in real-time
pm2 logs discord-bot --lines 50

# Stop bot
pm2 stop discord-bot

# Restart bot
pm2 restart discord-bot

# Update bot (after uploading new files)
cd /home/discordbot/bot
npm install
pm2 restart discord-bot

# Check system resources
htop
free -h
df -h
```

## Security Notes

- Bot runs as non-root user `discordbot`
- Firewall only allows SSH access
- MySQL user has minimal permissions
- Environment variables stored securely

## Backup Your Data

```bash
# Backup configuration files
sudo cp -r /home/discordbot/bot/data/ ~/backup-$(date +%Y%m%d)/

# Backup MySQL database
mysqldump -u botuser -p discord_bot > bot_backup.sql
```
