# Dynamic Command Registration System

This system allows Discord slash commands to be automatically registered/unregistered based on enabled features in the web app, without requiring bot restarts.

## How It Works

1. **Web App**: User toggles a feature on/off in the admin panel
2. **API**: Feature update triggers a call to the bot's command server
3. **Bot**: Receives the update and immediately registers/unregisters Discord commands
4. **Discord**: Commands appear/disappear instantly for users

## Files

- `commandManager.js` - Main command handling and Discord integration
- `commandRegistry.js` - Command definitions and Discord API calls
- `commandServer.js` - HTTP server for receiving web app updates
- `integration-example.js` - Example of how to integrate into your bot

## Setup

### 1. Install Dependencies

```bash
npm install discord.js
```

### 2. Add to Your Bot

Copy the integration example into your main bot file:

```javascript
const { CommandManager } = require('./commandManager');
const { CommandServer } = require('./commandServer');

// Initialize command manager
const commandManager = new CommandManager(client);

// Initialize command server (for web app communication)
const commandServer = new CommandServer(commandManager, 3001);

// Start command server when bot is ready
client.once('ready', () => {
  commandServer.start();
});
```

### 3. Configure Ports

The command server runs on port 3001 by default. Make sure this port is available and not blocked by your firewall.

### 4. Web App Configuration

The web app will automatically call `http://localhost:3001/commands` when features are toggled.

## Features Supported

- **Moderation**: `/warn`, `/kick`, `/ban`, `/mute`
- **Reaction Roles**: `/role` (add/remove/list)
- **Custom Commands**: `/custom`
- **Verification System**: `/sendverify`, `/setverifylog`
- **Feedback System**: `/feedback`
- **Embedded Messages**: `/embed`

## Adding New Features

To add support for a new feature:

1. **Add command definition** in `commandRegistry.js`
2. **Add command handler** in `commandManager.js`
3. **Update feature mapping** in the web app

## Testing

1. Start your bot
2. Toggle a feature in the web app admin panel
3. Check Discord - commands should appear/disappear immediately
4. Check bot console for registration logs

## Troubleshooting

### Commands Not Appearing
- Check bot console for errors
- Verify command server is running on port 3001
- Check Discord bot permissions (applications.commands)

### Web App Can't Reach Bot
- Verify bot is running
- Check firewall settings
- Ensure port 3001 is accessible

### Commands Not Working
- Check bot intents (need Guilds, GuildMessages, etc.)
- Verify bot has permission to use slash commands
- Check command handler logic

## Security Notes

- The command server accepts connections from localhost only
- Consider adding authentication if exposing to external networks
- Commands are guild-specific (only affect the target server)

## Performance

- Command updates are immediate (no caching delays)
- Only affected guilds are updated
- Minimal Discord API calls (only when features change)
