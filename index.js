// Main entry point for the Discord bot and API server
const client = require('./config/bot');
const startServer = require('./server');
const { CommandManager } = require('./commandManager');
const { CommandServer } = require('./commandServer');

// Initialize command manager and server
const commandManager = new CommandManager(client);
const commandServer = new CommandServer(commandManager, 3003);

// Attach command manager to client for access in event handlers
client.commandManager = commandManager;

client.once('ready', () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  
  // Start the command server for web app communication
  commandServer.start();
  console.log('[BOT] Command server started on port 3003');
  
  startServer(client);
});
