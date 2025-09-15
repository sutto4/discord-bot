/**
 * Access Control Event Handlers
 * Automatically remove users from server_access_control when they lose Discord access
 */

const { pool } = require('../config/database-multi-guild');

async function removeUserAccess(guildId, userId, reason = 'Unknown') {
  try {
    const [result] = await pool.execute(
      'DELETE FROM server_access_control WHERE guild_id = ? AND user_id = ?',
      [guildId, userId]
    );
    
    if (result.affectedRows > 0) {
      console.log(`[ACCESS-CONTROL] ✅ Removed user ${userId} from guild ${guildId} access (${reason})`);
    }
  } catch (error) {
    console.error(`[ACCESS-CONTROL] ❌ Error removing user ${userId} from guild ${guildId}:`, error);
  }
}

async function checkUserRoleAccess(guildId, userId, userRoles) {
  try {
    // Check if user has any roles that grant app access
    const [roleRows] = await pool.execute(
      'SELECT role_id FROM server_role_permissions WHERE guild_id = ? AND can_use_app = 1',
      [guildId]
    );
    
    const allowedRoleIds = roleRows.map(row => row.role_id);
    const hasRequiredRole = userRoles.some(roleId => allowedRoleIds.includes(roleId));
    
    if (!hasRequiredRole && allowedRoleIds.length > 0) {
      // User lost all required roles, remove from access control
      await removeUserAccess(guildId, userId, 'Lost required roles');
    }
  } catch (error) {
    console.error(`[ACCESS-CONTROL] ❌ Error checking role access for user ${userId}:`, error);
  }
}

function setupAccessControlEvents(client) {
  console.log('[ACCESS-CONTROL] 🔧 Setting up access control event handlers...');
  
  // When a user leaves or is removed from a guild
  client.on('guildMemberRemove', async (member) => {
    try {
      await removeUserAccess(
        member.guild.id, 
        member.user.id, 
        'User left/kicked/banned from guild'
      );
    } catch (error) {
      console.error('[ACCESS-CONTROL] Error handling guildMemberRemove:', error);
    }
  });
  
  // When a user's roles change
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Check if user lost roles that granted app access
      const oldRoles = oldMember.roles.cache.map(role => role.id);
      const newRoles = newMember.roles.cache.map(role => role.id);
      
      // If roles changed, check if user still has required access
      if (oldRoles.length !== newRoles.length || !oldRoles.every(role => newRoles.includes(role))) {
        await checkUserRoleAccess(newMember.guild.id, newMember.user.id, newRoles);
      }
    } catch (error) {
      console.error('[ACCESS-CONTROL] Error handling guildMemberUpdate:', error);
    }
  });
  
  // When the bot is removed from a guild
  client.on('guildDelete', async (guild) => {
    try {
      // Remove all access control entries for this guild
      const [result] = await pool.execute(
        'DELETE FROM server_access_control WHERE guild_id = ?',
        [guild.id]
      );
      
      if (result.affectedRows > 0) {
        console.log(`[ACCESS-CONTROL] ✅ Cleaned up ${result.affectedRows} access entries for removed guild ${guild.id}`);
      }
    } catch (error) {
      console.error(`[ACCESS-CONTROL] Error cleaning up guild ${guild.id}:`, error);
    }
  });
  
  // When a role is deleted
  client.on('roleDelete', async (role) => {
    try {
      // Remove the role from server_role_permissions
      const [result] = await pool.execute(
        'DELETE FROM server_role_permissions WHERE guild_id = ? AND role_id = ?',
        [role.guild.id, role.id]
      );
      
      if (result.affectedRows > 0) {
        console.log(`[ACCESS-CONTROL] ✅ Cleaned up permissions for deleted role ${role.id} in guild ${role.guild.id}`);
      }
    } catch (error) {
      console.error(`[ACCESS-CONTROL] Error cleaning up deleted role ${role.id}:`, error);
    }
  });
  
  console.log('[ACCESS-CONTROL] ✅ Access control event handlers registered');
}

module.exports = { setupAccessControlEvents, removeUserAccess, checkUserRoleAccess };
