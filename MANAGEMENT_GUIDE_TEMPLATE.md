# Discord Bot Management Guide

## Overview
This guide covers how to manage your Discord bot infrastructure, including VPS management, database access, and bot operations.

## Infrastructure Details
- **VPS**: Vultr Ubuntu 22.04 LTS ($6/month)
- **IP Address**: [YOUR_VPS_IP]
- **Database**: MySQL 8.0.42 (chester_bot)
- **Process Manager**: PM2
- **Security**: SSH tunneling for database access

---

## 1. VPS Access

### SSH Connection
```bash
ssh root@[YOUR_VPS_IP]
```
Enter your VPS root password when prompted.

### Check System Status
```bash
# System resources
htop
free -h
df -h

# Active services
systemctl status mysql
systemctl status ssh
```

---

## 2. Bot Management with PM2

### Check Bot Status
```bash
pm2 status
pm2 show chester-bot
```

### Start/Stop/Restart Bot
```bash
# Start bot
pm2 start ecosystem.config.js

# Stop bot
pm2 stop chester-bot

# Restart bot
pm2 restart chester-bot

# Reload bot (zero downtime)
pm2 reload chester-bot
```

### View Bot Logs
```bash
# Real-time logs
pm2 logs chester-bot

# Last 100 lines
pm2 logs chester-bot --lines 100

# Error logs only
pm2 logs chester-bot --err
```

### Update Bot Code
```bash
# Navigate to bot directory
cd /root/discord-bot

# Pull latest changes
git pull

# Install dependencies (if package.json changed)
npm install

# Restart bot with new code
pm2 restart chester-bot
```

---

## 3. Database Management

### SSH Tunnel Setup (Required for HeidiSQL)

**From your local Windows machine:**
```bash
ssh -L 3306:localhost:3306 root@[YOUR_VPS_IP]
```
- Enter VPS password when prompted
- **Keep this terminal open** while using HeidiSQL
- The tunnel forwards your local port 3306 to the remote MySQL server

### HeidiSQL Connection Settings
- **Network Type**: MySQL (TCP/IP)
- **Hostname/IP**: `127.0.0.1`
- **User**: `[BOT_DB_USER]`
- **Password**: `[BOT_DB_PASSWORD]`
- **Port**: `3306`
- **Database**: `chester_bot`

### Direct MySQL Access (On VPS)
```bash
# Connect to MySQL
mysql -u [BOT_DB_USER] -p chester_bot

# Common queries
SHOW TABLES;
SELECT * FROM guilds;
DESCRIBE guilds;

# Exit MySQL
EXIT;
```

### Database Backup
```bash
# Create backup
mysqldump -u [BOT_DB_USER] -p chester_bot > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
mysql -u [BOT_DB_USER] -p chester_bot < backup_file.sql
```

---

## 4. Monitoring & Troubleshooting

### Check Bot Connectivity
```bash
# Test Discord API connection
curl -H "Authorization: Bot YOUR_TOKEN" https://discord.com/api/v10/gateway/bot

# Check if bot is in guilds
pm2 logs chester-bot | grep "guild"
```

### Monitor System Resources
```bash
# CPU and memory usage
top
htop

# Disk usage
df -h
du -sh /root/discord-bot/

# Network connections
netstat -tulpn | grep 3306
```

### Firewall Status
```bash
# UFW status
ufw status

# Check open ports
ss -tulpn
```

---

## 5. Security Management

### SSH Key Management
```bash
# View authorized keys
cat ~/.ssh/authorized_keys

# Add new SSH key
echo "ssh-rsa YOUR_PUBLIC_KEY" >> ~/.ssh/authorized_keys
```

### MySQL Security
```bash
# Check MySQL users
mysql -u root -p -e "SELECT user, host FROM mysql.user;"

# Check database permissions
mysql -u root -p -e "SHOW GRANTS FOR '[BOT_DB_USER]'@'localhost';"
```

### Update System
```bash
# Update packages
apt update && apt upgrade -y

# Restart if kernel updated
reboot
```

---

## 6. Bot Configuration

### Environment Variables
Edit `/root/discord-bot/.env`:
```bash
nano /root/discord-bot/.env
```

### Add New Guild
1. Connect to database via HeidiSQL
2. Insert new record in `guilds` table:
   ```sql
   INSERT INTO guilds (guild_id, guild_name, active) 
   VALUES ('GUILD_ID_HERE', 'Server Name', 1);
   ```
3. Update `GUILD_IDS` in `.env` file
4. Restart bot: `pm2 restart chester-bot`

---

## 7. Business Operations

### Customer Onboarding
1. **Get guild ID** from customer's Discord server
2. **Add to database** using HeidiSQL
3. **Update .env** with new guild ID
4. **Restart bot** to apply changes
5. **Test verification** in customer's server

### Pricing & Billing
- **Service**: $15/month per Discord server
- **Infrastructure Cost**: $6/month VPS
- **Profit Margin**: $9/month per customer

### Support Workflow
1. **Check logs**: `pm2 logs chester-bot`
2. **Verify database**: Connect via HeidiSQL
3. **Test commands**: Use Discord server
4. **Monitor metrics**: Check PM2 status

---

## 8. Quick Reference Commands

```bash
# SSH to VPS
ssh root@[YOUR_VPS_IP]

# Check bot status
pm2 status

# View bot logs
pm2 logs chester-bot

# Restart bot
pm2 restart chester-bot

# Connect to MySQL
mysql -u [BOT_DB_USER] -p chester_bot

# Check system resources
htop

# Update bot code
cd /root/discord-bot && git pull && pm2 restart chester-bot
```

---

## 9. Emergency Procedures

### Bot Down
1. Check PM2 status: `pm2 status`
2. View error logs: `pm2 logs chester-bot --err`
3. Restart bot: `pm2 restart chester-bot`
4. If still failing, check `.env` file and database connectivity

### Database Connection Issues
1. Verify MySQL is running: `systemctl status mysql`
2. Check firewall: `ufw status`
3. Test local connection: `mysql -u [BOT_DB_USER] -p chester_bot`
4. For HeidiSQL: Ensure SSH tunnel is active

### VPS Issues
1. Check via Vultr dashboard
2. Reboot if necessary: `reboot`
3. Monitor boot process via VNC console
4. Verify services start automatically

---

## 10. Backup Strategy

### Automated Backups
Create daily backup script:
```bash
#!/bin/bash
# /root/backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u [BOT_DB_USER] -p chester_bot > /root/backups/db_backup_$DATE.sql
find /root/backups/ -name "*.sql" -mtime +7 -delete
```

### Code Backups
- Bot code is version controlled with Git
- Regular pushes to GitHub repository
- `.env` file should be backed up separately (contains secrets)

---

*Last Updated: August 2025*
*For support or questions, refer to this guide or check PM2 logs for troubleshooting.*

**Note**: Replace placeholders with actual values:
- `[YOUR_VPS_IP]` - Your VPS IP address
- `[BOT_DB_USER]` - Your bot database username
- `[BOT_DB_PASSWORD]` - Your bot database password
