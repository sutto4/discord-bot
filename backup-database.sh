#!/bin/bash

# Backup Script for Discord Bot Database
# Add this to your current VPS setup

# Create backup directory
mkdir -p /home/discordbot/backups

# Create daily backup with timestamp
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u botuser -p'your_secure_password' discord_bot > /home/discordbot/backups/discord_bot_backup_$DATE.sql

# Keep only last 7 days of backups
find /home/discordbot/backups -name "discord_bot_backup_*.sql" -mtime +7 -delete

echo "Backup completed: discord_bot_backup_$DATE.sql"

# Optional: Upload to cloud storage
# aws s3 cp /home/discordbot/backups/discord_bot_backup_$DATE.sql s3://your-backup-bucket/
