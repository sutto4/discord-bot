// Main entry point for the Discord bot and API server
const client = require('./config/bot');
const startServer = require('./server');

client.once('ready', () => {
  startServer(client);
});
