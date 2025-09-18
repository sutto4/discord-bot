// Optimized guilds endpoint with parallel processing and caching
const { performance } = require('perf_hooks');

// In-memory cache for guild data
const guildCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting for Discord API calls
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 50;

function checkRateLimit() {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [timestamp] of rateLimiter) {
    if (timestamp < windowStart) {
      rateLimiter.delete(timestamp);
    }
  }
  
  return rateLimiter.size < MAX_REQUESTS_PER_WINDOW;
}

function addRateLimit() {
  rateLimiter.set(Date.now(), true);
}

async function fetchGuildDataParallel(guildIds, client) {
  const startTime = performance.now();
  console.log(`[PERF] 🚀 Starting parallel fetch for ${guildIds.length} guilds`);
  
  // Process in batches to avoid overwhelming Discord API
  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < guildIds.length; i += batchSize) {
    batches.push(guildIds.slice(i, i + batchSize));
  }
  
  const results = [];
  
  for (const batch of batches) {
    if (!checkRateLimit()) {
      console.log(`[PERF] ⚠️ Rate limit reached, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const batchPromises = batch.map(async (guildId) => {
      try {
        addRateLimit();
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
        console.warn(`[PERF] ⚠️ Failed to fetch guild ${guildId}:`, err.message);
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
    
    // Small delay between batches to be respectful to Discord API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const endTime = performance.now();
  console.log(`[PERF] ✅ Parallel fetch completed in ${(endTime - startTime).toFixed(2)}ms`);
  
  return results;
}

async function updateGuildDataInDatabase(guilds, appDb) {
  const startTime = performance.now();
  console.log(`[PERF] 🚀 Starting database updates for ${guilds.length} guilds`);
  
  const updatePromises = guilds.map(async (guild) => {
    try {
      await appDb.query(
        "UPDATE guilds SET member_count = ?, member_count_updated_at = NOW(), status = ? WHERE guild_id = ?",
        [guild.memberCount || 0, guild.status, guild.guild_id]
      );
    } catch (dbError) {
      console.warn(`[PERF] ⚠️ Could not update guild ${guild.guild_id}:`, dbError.message);
    }
  });
  
  await Promise.all(updatePromises);
  
  const endTime = performance.now();
  console.log(`[PERF] ✅ Database updates completed in ${(endTime - startTime).toFixed(2)}ms`);
}

// Optimized guilds endpoint
app.get("/api/guilds-optimized", async (req, res) => {
  const startTime = performance.now();
  console.log(`[PERF] 🚀 Optimized guilds endpoint started`);
  
  try {
    // Check cache first
    const cacheKey = 'guilds-optimized';
    const cached = guildCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[PERF] ✅ Cache hit for guilds data`);
      return res.json(cached.data);
    }
    
    // Get guild IDs from database
    const dbStartTime = performance.now();
    const guildsResult = await appDb.query("SELECT guild_id, guild_name, status, icon_url, icon_hash, member_count FROM guilds WHERE status = 'active'");
    const dbEndTime = performance.now();
    console.log(`[PERF] ✅ Database query completed in ${(dbEndTime - dbStartTime).toFixed(2)}ms`);
    
    const rows = guildsResult[0];
    const guildIds = rows.map(row => row.guild_id);
    
    if (guildIds.length === 0) {
      console.log(`[PERF] ⚠️ No active guilds found`);
      return res.json([]);
    }
    
    // Fetch guild data in parallel
    const guilds = await fetchGuildDataParallel(guildIds, client);
    
    // Update database with fresh data (in parallel)
    await updateGuildDataInDatabase(guilds, appDb);
    
    // Cache the results
    guildCache.set(cacheKey, {
      data: guilds,
      timestamp: Date.now()
    });
    
    const endTime = performance.now();
    console.log(`[PERF] ✅ Optimized guilds endpoint completed in ${(endTime - startTime).toFixed(2)}ms`);
    
    res.json(guilds);
  } catch (error) {
    console.error(`[PERF] ❌ Error in optimized guilds endpoint:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cache warming endpoint
app.post("/api/guilds/warm-cache", async (req, res) => {
  try {
    console.log(`[PERF] 🔥 Warming guild cache...`);
    guildCache.clear();
    
    // Trigger a cache refresh
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/guilds-optimized`);
    const data = await response.json();
    
    console.log(`[PERF] ✅ Cache warmed with ${data.length} guilds`);
    res.json({ message: 'Cache warmed successfully', guildCount: data.length });
  } catch (error) {
    console.error(`[PERF] ❌ Error warming cache:`, error);
    res.status(500).json({ error: 'Failed to warm cache' });
  }
});

// Cache stats endpoint
app.get("/api/guilds/cache-stats", (req, res) => {
  const stats = {
    cacheSize: guildCache.size,
    rateLimitSize: rateLimiter.size,
    cacheKeys: Array.from(guildCache.keys()),
    oldestCacheEntry: guildCache.size > 0 ? 
      Math.min(...Array.from(guildCache.values()).map(entry => entry.timestamp)) : null
  };
  
  res.json(stats);
});

module.exports = {
  fetchGuildDataParallel,
  updateGuildDataInDatabase,
  guildCache,
  checkRateLimit,
  addRateLimit
};
