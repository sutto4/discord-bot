// Main entry point for the Discord bot and API server
const client = require('./config/bot');
const startServer = require('./server');
const { CommandManager } = require('./commandManager');

// Initialize command manager
const commandManager = new CommandManager(client);

// Attach command manager to client for access in event handlers
client.commandManager = commandManager;

client.once('ready', () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  
  startServer(client);
});
