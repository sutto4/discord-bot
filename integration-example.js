// Example integration for the main bot file
// Add this to your main bot file (e.g., index.js or bot.js)

const { Client, GatewayIntentBits } = require('discord.js');
const { CommandManager } = require('./commandManager');
const { CommandServer } = require('./commandServer');

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// Initialize command manager
const commandManager = new CommandManager(client);

// Initialize command server (for web app communication)
const commandServer = new CommandServer(commandManager, 3001);

// Bot ready event
client.once('ready', async () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  
  // Start the command server
  commandServer.start();
  
  // Register commands for all guilds on startup
  await registerAllGuildCommands();
});

// Function to register commands for all guilds
async function registerAllGuildCommands() {
  try {
    console.log('[BOT] Registering commands for all guilds...');
    
    // Get all guilds the bot is in
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
      try {
        // Get enabled features for this guild from database
        // This is a placeholder - you'll need to implement your own database connection
        const enabledFeatures = await getGuildFeatures(guildId);
        
        if (enabledFeatures.length > 0) {
          await commandManager.updateGuildCommands(guildId, enabledFeatures);
          console.log(`[BOT] Commands registered for guild ${guild.name} (${guildId})`);
        } else {
          console.log(`[BOT] No features enabled for guild ${guild.name} (${guildId})`);
        }
      } catch (error) {
        console.error(`[BOT] Error registering commands for guild ${guildId}:`, error);
      }
    }
    
    console.log('[BOT] Command registration complete');
  } catch (error) {
    console.error('[BOT] Error during command registration:', error);
  }
}

// Placeholder function - implement your own database connection
async function getGuildFeatures(guildId) {
  // This should connect to your database and get enabled features
  // For now, returning empty array
  return [];
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[BOT] Shutting down...');
  commandServer.stop();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[BOT] Shutting down...');
  commandServer.stop();
  client.destroy();
  process.exit(0);
});
