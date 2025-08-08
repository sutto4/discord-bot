# Upload Discord Bot to VPS
# Make sure you have SSH access configured

$VPS_IP = "149.28.168.163"
$VPS_USER = "root"  # or your username
$LOCAL_PATH = "g:\discord-bot\*"
$REMOTE_PATH = "/home/discordbot/bot/"

Write-Host "🚀 Uploading Discord Bot files to VPS..."

# Upload files using SCP
scp -r $LOCAL_PATH "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Files uploaded successfully!"
    Write-Host "📋 Next steps on your VPS:"
    Write-Host "1. SSH into your VPS: ssh $VPS_USER@$VPS_IP"
    Write-Host "2. Run: cd /home/discordbot/bot && npm install"
    Write-Host "3. Run the MySQL setup commands"
    Write-Host "4. Start the bot: pm2 start bot.js --name discord-bot"
} else {
    Write-Host "❌ Upload failed. Check your SSH connection."
}
