# Fat Duck Gaming Discord Bot

A comprehensive Discord bot for managing donator roles, verification, server information, and user feedback for Fat Duck Gaming FiveM server.

## Features

- **🔐 Verification System**: Button-based verification with role assignment
- **💰 Donator Role Management**: Automated role sync based on Tebex donations
- **🎮 Server Information**: Quick connect commands and store information
- **📝 Feedback System**: Modal-based feedback collection with configurable channels
- **📊 Logging**: Verification, role assignment, and feedback logging
- **⚡ Slash Commands**: Modern Discord slash command support
- **💬 Dot Commands**: Message-based commands for quick access

## Commands

### Slash Commands
- `/config` - Configure all bot settings via modal UI
- `/sendverify` - Send verification embed with button
- `/setverifylog <channel>` - Set verification logging channel
- `/setfeedbackchannel <channel>` - Set feedback submissions channel
- `/syncroles` - Manually sync donator roles

### Dot Commands
- `.tebex` - Display Tebex store information with donation button
- `.connect` - Show server connection information with one-click connect
- `.feedback` - Submit feedback via modal form
- `.help` - Show all available dot commands

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- MySQL database
- Discord Bot Token
- Tebex integration (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd discord-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   
   Create a `.env` file in the root directory:
   ```env
   # Discord Configuration
   TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   GUILD_ID=your_discord_server_id
   # OR for multiple servers:
   # GUILD_IDS=server_id_1,server_id_2,server_id_3
   
   # Database Configuration
   DB_HOST=localhost
   DB_USER=your_db_username
   DB_PASSWORD=your_db_password
   DB_NAME=fivem_live
   DB_PORT=3306
   
   # Role Configuration
   VERIFY_ROLE_ID=your_verify_role_id
   ```

4. **Database Setup**
   
   Ensure your MySQL database has the following tables:
   ```sql
   -- Accounts table
   CREATE TABLE accounts (
       accountid INT PRIMARY KEY,
       discord VARCHAR(255)
   );
   
   -- Tebex accounts table
   CREATE TABLE tebex_accounts (
       accountid INT PRIMARY KEY,
       t1_expiry DATETIME,
       t2_expiry DATETIME,
       t3_expiry DATETIME,
       FOREIGN KEY (accountid) REFERENCES accounts(accountid)
   );
   ```

5. **Deploy Slash Commands**
   ```bash
   node deploy-commands.js
   ```

6. **Start the Bot**
   ```bash
   node config/bot.js
   ```

## Configuration

### Initial Setup
1. **Deploy Slash Commands**: `node deploy-commands.js`
2. **Start the Bot**: `node config/bot.js`

### In Discord
- **Easy setup**: Use `/config` to configure all settings via dropdown menus
- **Alternative**: Use individual commands `/setverifylog` and `/setfeedbackchannel`
- **Create verification embed**: `/sendverify`

### Role Sync
- **Automatic**: Every 12 hours (configurable in `config/bot.js`)
- **Manual**: Use `/syncroles` command

## File Structure

```
discord-bot/
├── commands/           # Slash commands
│   ├── sendverify.js
│   ├── setverifylog.js
│   ├── setfeedbackchannel.js
│   └── syncroles.js
├── config/            # Configuration files
│   ├── bot.js         # Main bot file
│   ├── database.js    # Database connection
│   └── roles.js       # Role mappings
├── data/              # Data storage
│   ├── verify_log_channels.json
│   └── feedback_channels.json
├── dotcommands/       # Dot commands (.command)
│   ├── connect.js
│   ├── feedback.js
│   ├── help.js
│   └── tebex.js
├── events/            # Discord event handlers
│   ├── guildMemberAdd.js
│   ├── interactionCreate.js
│   ├── messageCreate.js
│   └── ready.js
├── helpers/           # Utility functions
│   ├── applyDonatorRole.js
│   ├── feedbackLogger.js
│   └── logger.js
├── jobs/              # Background jobs
│   └── syncDonators.js
├── deploy-commands.js # Command deployment
├── package.json
└── .env              # Environment variables
```

## Quick Start

1. **Install**: `npm install`
2. **Configure**: Create `.env` file with required credentials
3. **Deploy**: `node deploy-commands.js`
4. **Run**: `node config/bot.js`
5. **Setup Channels**: Use `/setverifylog` and `/setfeedbackchannel`
2. Use `/sendverify` to create verification embed
3. Users click "Verify" button to get roles

### User Features
- **`.help`** - See all available commands
- **`.tebex`** - View donation store with direct link
- **`.connect`** - Get server connection methods
- **`.feedback`** - Submit feedback via form

### Admin Features  
- **Role sync** automatically runs every 12 hours
- **Manual sync** with `/syncroles` command
- **Logging** for all verification and role changes
- **Feedback management** in dedicated channel

## Troubleshooting

**Bot not responding:** Check permissions, token, and deployed commands  
**Database errors:** Verify `.env` credentials and database tables  
**Role sync issues:** Check role IDs and bot permissions

## Support

Discord: https://discord.gg/fatduckgaming
