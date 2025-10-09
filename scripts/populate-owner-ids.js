// One-time script to populate owner_id for existing guilds
const { Client, GatewayIntentBits } = require('discord.js');
const { appDb } = require('../config/database');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ]
});

async function populateOwnerIds() {
  console.log('[POPULATE-OWNERS] Starting...');
  
  try {
    // Get all guilds from database
    const [guilds] = await appDb.query('SELECT guild_id FROM guilds');
    console.log(`[POPULATE-OWNERS] Found ${guilds.length} guilds in database`);
    
    let updated = 0;
    let failed = 0;
    
    for (const guildRow of guilds) {
      try {
        const guild = await client.guilds.fetch(guildRow.guild_id);
        
        await appDb.query(
          'UPDATE guilds SET owner_id = ? WHERE guild_id = ?',
          [guild.ownerId, guildRow.guild_id]
        );
        
        console.log(`[POPULATE-OWNERS] ✅ Updated ${guild.name}: ${guild.ownerId}`);
        updated++;
      } catch (error) {
        console.error(`[POPULATE-OWNERS] ❌ Failed to fetch guild ${guildRow.guild_id}:`, error.message);
        failed++;
      }
    }
    
    console.log(`[POPULATE-OWNERS] Complete! Updated: ${updated}, Failed: ${failed}`);
    process.exit(0);
  } catch (error) {
    console.error('[POPULATE-OWNERS] Error:', error);
    process.exit(1);
  }
}

client.once('ready', () => {
  console.log('[POPULATE-OWNERS] Bot ready, starting population...');
  populateOwnerIds();
});

client.login(process.env.DISCORD_TOKEN);


