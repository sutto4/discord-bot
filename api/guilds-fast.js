// Fast guilds endpoint with parallel processing
const { performance } = require('perf_hooks');

// In-memory cache for guild data
const guildCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function fetchGuildDataFast(guildIds, client) {
  const startTime = performance.now();
  console.log(`[FAST-API] 🚀 Processing ${guildIds.length} guilds in parallel`);
  
  // Process in smaller batches to avoid overwhelming Discord
  const batchSize = 5;
  const results = [];
  
  for (let i = 0; i < guildIds.length; i += batchSize) {
    const batch = guildIds.slice(i, i + batchSize);
    console.log(`[FAST-API] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(guildIds.length/batchSize)}`);
    
    const batchPromises = batch.map(async (guildId) => {
      try {
        const guild = await client.guilds.fetch(guildId);
        await guild.roles.fetch(); // Fetch roles in parallel
        
        return {
          guild_id: guildId,
          guild_name: guild.name,
          status: 'active',
          memberCount: guild.memberCount || 0,
          roleCount: guild.roles.cache.size || 0,
          iconUrl: guild.iconURL ? guild.iconURL({ size: 128, extension: "png" }) : null,
          createdAt: guild.createdAt ? guild.createdAt.toISOString() : null
        };
      } catch (err) {
        console.warn(`[FAST-API] ⚠️ Failed to fetch guild ${guildId}:`, err.message);
        return {
          guild_id: guildId,
          guild_name: 'Unknown',
          status: 'error',
          memberCount: 0,
          roleCount: 0,
          iconUrl: null,
          createdAt: null,
          error: err.message
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const endTime = performance.now();
  console.log(`[FAST-API] ✅ Completed in ${(endTime - startTime).toFixed(2)}ms`);
  
  return results;
}

module.exports = { fetchGuildDataFast };
