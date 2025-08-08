#!/bin/bash

# Discord Bot VPS Deployment Script
# Run this on your Ubuntu VPS after uploading your bot files

echo "🚀 Setting up Discord Bot on VPS..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
echo "📥 Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MySQL
echo "🗄️ Installing MySQL..."
sudo apt install -y mysql-server

# Install PM2 for process management
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# Install Git (if not already installed)
echo "📡 Installing Git..."
sudo apt install -y git

# Create bot user (security best practice)
echo "👤 Creating bot user..."
sudo useradd -m -s /bin/bash discordbot
sudo usermod -aG sudo discordbot

# Create bot directory
echo "📁 Setting up bot directory..."
sudo mkdir -p /home/discordbot/bot
sudo chown -R discordbot:discordbot /home/discordbot/

# Setup MySQL
echo "🔧 Configuring MySQL..."
# Create the chester_bot database
sudo mysql -e "CREATE DATABASE chester_bot;"

# Create local user for bot
sudo mysql -e "CREATE USER 'sutto'@'localhost' IDENTIFIED BY 'Zdu%^!sF1VKLC@@y';"
sudo mysql -e "GRANT ALL PRIVILEGES ON chester_bot.* TO 'sutto'@'localhost';"

# Create remote user for external connections (replace YOUR_IP with your actual IP)
sudo mysql -e "CREATE USER 'sutto'@'%' IDENTIFIED BY 'Zdu%^!sF1VKLC@@y';"
sudo mysql -e "GRANT ALL PRIVILEGES ON chester_bot.* TO 'sutto'@'%';"
sudo mysql -e "FLUSH PRIVILEGES;"

# Configure MySQL to accept remote connections
echo "🌐 Configuring MySQL for remote access..."
sudo sed -i 's/bind-address\s*=\s*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql

# Setup UFW firewall (allow SSH and MySQL)
echo "🔒 Configuring firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 22
sudo ufw allow 3306/tcp

echo "✅ VPS setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Upload your bot files to /home/discordbot/bot/"
echo "2. Create your .env file with your bot token"
echo "3. Run: cd /home/discordbot/bot && npm install"
echo "4. Run: pm2 start bot.js --name discord-bot"
echo "5. Run: pm2 startup && pm2 save"
echo ""
echo "🔐 Important: Change the MySQL password in the script above!"
