/**
 * Startup Access Cleanup
 * Runs once when bot starts to clean up any stale entries from when bot was offline
 */

const { pool } = require('../config/database-multi-guild');

async function startupAccessCleanup(client) {
  console.log('[STARTUP-CLEANUP] 🧹 Running startup access control cleanup...');
  
  try {
    // Get all entries from server_access_control
    const [entries] = await pool.execute(
      'SELECT guild_id, user_id FROM server_access_control WHERE has_access = 1'
    );
    
    if (entries.length === 0) {
      console.log('[STARTUP-CLEANUP] No entries found in server_access_control table');
      return;
    }
    
    console.log(`[STARTUP-CLEANUP] Checking ${entries.length} access control entries...`);
    
    let cleanedCount = 0;
    let errorCount = 0;
    
    for (const entry of entries) {
      const { guild_id, user_id } = entry;
      
      try {
        // Check if bot still has access to the guild
        const guild = client.guilds.cache.get(guild_id);
        if (!guild) {
          // Guild not found, remove all access entries
          await pool.execute(
            'DELETE FROM server_access_control WHERE guild_id = ?',
            [guild_id]
          );
          cleanedCount++;
          console.log(`[STARTUP-CLEANUP] ✅ Removed access entries for missing guild ${guild_id}`);
          continue;
        }
        
        // Check if user is still in the guild
        try {
          const member = await guild.members.fetch(user_id);
          if (!member) {
            // User not in guild, remove access
            await pool.execute(
              'DELETE FROM server_access_control WHERE guild_id = ? AND user_id = ?',
              [guild_id, user_id]
            );
            cleanedCount++;
            console.log(`[STARTUP-CLEANUP] ✅ Removed access for user ${user_id} no longer in guild ${guild_id}`);
          }
        } catch (fetchError) {
          // User not found (left guild), remove access
          await pool.execute(
            'DELETE FROM server_access_control WHERE guild_id = ? AND user_id = ?',
            [guild_id, user_id]
          );
          cleanedCount++;
          console.log(`[STARTUP-CLEANUP] ✅ Removed access for user ${user_id} who left guild ${guild_id}`);
        }
        
      } catch (error) {
        console.error(`[STARTUP-CLEANUP] ❌ Error checking user ${user_id} in guild ${guild_id}:`, error.message);
        errorCount++;
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`[STARTUP-CLEANUP] 🎉 Cleanup completed:`);
    console.log(`[STARTUP-CLEANUP]    ✅ Cleaned: ${cleanedCount} stale entries`);
    console.log(`[STARTUP-CLEANUP]    ❌ Errors: ${errorCount} entries`);
    console.log(`[STARTUP-CLEANUP]    📊 Total checked: ${entries.length} entries`);
    
  } catch (error) {
    console.error('[STARTUP-CLEANUP] ❌ Fatal error during startup cleanup:', error);
  }
}

module.exports = { startupAccessCleanup };
