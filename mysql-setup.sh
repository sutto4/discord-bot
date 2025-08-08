#!/bin/bash

# MySQL Setup Script for Discord Bot
# Run this after you've already installed the basic packages

echo "🗄️ Setting up MySQL for Discord Bot..."

# Install MySQL if not already installed
echo "📦 Installing MySQL Server..."
sudo apt install -y mysql-server

# Setup MySQL
echo "🔧 Configuring MySQL..."
# Create the chester_bot database
sudo mysql -e "CREATE DATABASE chester_bot;"

# Create local user for bot
sudo mysql -e "CREATE USER 'sutto'@'localhost' IDENTIFIED BY 'Zdu%^!sF1VKLC@@y';"
sudo mysql -e "GRANT ALL PRIVILEGES ON chester_bot.* TO 'sutto'@'localhost';"

# Create remote user for external connections
sudo mysql -e "CREATE USER 'sutto'@'%' IDENTIFIED BY 'Zdu%^!sF1VKLC@@y';"
sudo mysql -e "GRANT ALL PRIVILEGES ON chester_bot.* TO 'sutto'@'%';"
sudo mysql -e "FLUSH PRIVILEGES;"

# Configure MySQL to accept remote connections
echo "🌐 Configuring MySQL for remote access..."
sudo sed -i 's/bind-address\s*=\s*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql

# Setup UFW firewall (allow MySQL)
echo "🔒 Opening firewall for MySQL..."
sudo ufw allow 3306/tcp

# Create bot directory if it doesn't exist
echo "📁 Setting up bot directory..."
sudo mkdir -p /home/discordbot/bot
sudo chown -R $USER:$USER /home/discordbot/

echo "✅ MySQL setup complete!"
echo ""
echo "🔗 You can now connect to MySQL with:"
echo "   Host: $(curl -s ifconfig.me)"
echo "   User: sutto"
echo "   Password: Zdu%^!sF1VKLC@@y"
echo "   Database: chester_bot"
echo "   Port: 3306"
echo ""
echo "📋 Next steps:"
echo "1. Upload your bot files to /home/discordbot/bot/"
echo "2. Upload your .env file with bot configuration"
echo "3. Run: cd /home/discordbot/bot && npm install"
echo "4. Run: pm2 start bot.js --name discord-bot"
echo "5. Test database connection with HeidiSQL"
