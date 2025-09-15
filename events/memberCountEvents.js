/**
 * Member Count Event Handlers
 * Real-time member count updates via Discord events
 */

const { pool } = require('../config/database-multi-guild');

async function updateMemberCount(guildId, memberCount, reason = 'Event update') {
  try {
    const [result] = await pool.execute(
      `UPDATE guilds 
       SET member_count = ?, member_count_updated_at = CURRENT_TIMESTAMP 
       WHERE guild_id = ?`,
      [memberCount, guildId]
    );
    
    if (result.affectedRows > 0) {
      console.log(`[MEMBER-COUNT] ✅ Updated guild ${guildId} to ${memberCount} members (${reason})`);
    } else {
      console.log(`[MEMBER-COUNT] ⚠️ Guild ${guildId} not found in database, skipping count update`);
    }
  } catch (error) {
    console.error(`[MEMBER-COUNT] ❌ Error updating member count for guild ${guildId}:`, error);
  }
}

async function updateGuildInfo(guildId, guildInfo) {
  try {
    const [result] = await pool.execute(
      `UPDATE guilds SET 
         name = ?, 
         icon_hash = ?, 
         icon_url = ?, 
         icon_synced_at = ?, 
         updated_at = NOW() 
       WHERE guild_id = ?`,
      [guildInfo.name, guildInfo.icon_hash, guildInfo.icon_url, guildInfo.icon_synced_at, guildId]
    );
    
    if (result.affectedRows > 0) {
      console.log(`[GUILD-SYNC] ✅ Updated guild info for ${guildInfo.name} (${guildId})`);
    }
  } catch (error) {
    console.error(`[GUILD-SYNC] ❌ Error updating guild info for ${guildId}:`, error);
  }
}

async function syncMemberCountForGuild(guild, reason = 'Manual sync') {
  try {
    // Get accurate member count from Discord
    const actualMemberCount = guild.memberCount;
    await updateMemberCount(guild.id, actualMemberCount, reason);
    
    // Also sync guild icon and name while we're here
    await updateGuildInfo(guild.id, {
      name: guild.name,
      icon_hash: guild.icon,
      icon_url: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
      icon_synced_at: new Date()
    });
    
    return actualMemberCount;
  } catch (error) {
    console.error(`[MEMBER-COUNT] ❌ Error syncing guild ${guild.id}:`, error);
    return null;
  }
}

async function syncAllGuildCounts(client, reason = 'Bulk sync') {
  console.log(`[MEMBER-COUNT] 🔄 Starting bulk member count sync (${reason})...`);
  
  try {
    const guilds = client.guilds.cache;
    console.log(`[MEMBER-COUNT] Found ${guilds.size} guilds to sync`);
    
    let updatedCount = 0;
    for (const [guildId, guild] of guilds) {
      const result = await syncMemberCountForGuild(guild, reason);
      if (result !== null) {
        updatedCount++;
      }
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`[MEMBER-COUNT] ✅ Bulk sync completed: Updated ${updatedCount}/${guilds.size} guilds`);
    return updatedCount;
  } catch (error) {
    console.error('[MEMBER-COUNT] ❌ Error during bulk sync:', error);
    return 0;
  }
}

async function startupMemberCountSync(client) {
  console.log('[MEMBER-COUNT] 🚀 Running startup member count reconciliation...');
  
  try {
    // Get only guilds that the bot is actually in and have stale data
    const botGuildIds = Array.from(client.guilds.cache.keys());
    
    if (botGuildIds.length === 0) {
      console.log('[MEMBER-COUNT] Bot is not in any guilds, skipping reconciliation');
      return;
    }
    
    console.log(`[MEMBER-COUNT] Bot is in ${botGuildIds.length} guilds, checking for stale data...`);
    
    // Create placeholders for the IN clause
    const placeholders = botGuildIds.map(() => '?').join(',');
    
    const [staleGuilds] = await pool.execute(
      `SELECT guild_id, guild_name, member_count, member_count_updated_at 
       FROM guilds 
       WHERE guild_id IN (${placeholders})
         AND (member_count_updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR) 
              OR member_count_updated_at IS NULL)
         AND (status = 'active' OR status IS NULL)`,
      botGuildIds
    );
    
    console.log(`[MEMBER-COUNT] Found ${staleGuilds.length} active guilds with stale member counts`);
    
    if (staleGuilds.length === 0) {
      console.log('[MEMBER-COUNT] All active guild member counts are up to date');
      return;
    }
    
    let reconciledCount = 0;
    for (const dbGuild of staleGuilds) {
      const guild = client.guilds.cache.get(dbGuild.guild_id);
      if (guild) {
        const currentCount = guild.memberCount;
        const dbCount = dbGuild.member_count;
        
        if (currentCount !== dbCount) {
          await updateMemberCount(guild.id, currentCount, 'Startup reconciliation');
          console.log(`[MEMBER-COUNT] 🔄 Reconciled ${dbGuild.guild_name}: ${dbCount} → ${currentCount}`);
          reconciledCount++;
        } else {
          console.log(`[MEMBER-COUNT] ✅ ${dbGuild.guild_name} already up to date (${currentCount} members)`);
        }
      } else {
        // This shouldn't happen since we filtered by bot guild IDs, but just in case
        console.log(`[MEMBER-COUNT] ⚠️ Guild ${dbGuild.guild_name} (${dbGuild.guild_id}) unexpectedly not in bot cache`);
      }
      
      // Small delay to avoid overwhelming Discord API
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    
    console.log(`[MEMBER-COUNT] ✅ Startup reconciliation completed: ${reconciledCount}/${staleGuilds.length} guilds updated`);
  } catch (error) {
    console.error('[MEMBER-COUNT] ❌ Error during startup reconciliation:', error);
  }
}

function setupMemberCountEvents(client) {
  console.log('[MEMBER-COUNT] 🔧 Setting up member count event handlers...');
  
  // When a member joins a guild
  client.on('guildMemberAdd', async (member) => {
    try {
      const guild = member.guild;
      await updateMemberCount(guild.id, guild.memberCount, 'Member joined');
    } catch (error) {
      console.error('[MEMBER-COUNT] Error handling guildMemberAdd:', error);
    }
  });
  
  // When a member leaves a guild
  client.on('guildMemberRemove', async (member) => {
    try {
      const guild = member.guild;
      await updateMemberCount(guild.id, guild.memberCount, 'Member left');
    } catch (error) {
      console.error('[MEMBER-COUNT] Error handling guildMemberRemove:', error);
    }
  });
  
  // When bot joins a new guild
  client.on('guildCreate', async (guild) => {
    try {
      await updateMemberCount(guild.id, guild.memberCount, 'Bot joined guild');
    } catch (error) {
      console.error('[MEMBER-COUNT] Error handling guildCreate:', error);
    }
  });
  
  // When bot is removed from a guild (handled by accessControlEvents, but good to have backup)
  client.on('guildDelete', async (guild) => {
    console.log(`[MEMBER-COUNT] 📊 Bot removed from guild ${guild.id}, member count tracking stopped`);
  });
  
  console.log('[MEMBER-COUNT] ✅ Member count event handlers registered');
}

module.exports = { 
  setupMemberCountEvents, 
  updateMemberCount, 
  syncMemberCountForGuild, 
  syncAllGuildCounts,
  startupMemberCountSync 
};
