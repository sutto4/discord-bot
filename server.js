// server.js
const express = require("express");
const { fivemDb, appDb } = require("./config/database");

/**
 * Start the HTTP API that the Next.js app calls.
 * Expects a connected Discord.js v14 client with GUILD_MEMBERS intent.
 */
module.exports = function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(express.json());

  // Make Discord client available to all routes
  app.use((req, res, next) => {
    req.client = client;
    next();
  });
  
  // Also store client in app for routes that need it
  app.set('client', client);

  // CORS: your Next app proxies to /api, but this is safe here
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Health
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Command server endpoints
  app.get("/api/commands/health", (_req, res) => {
    console.log(`🚨🚨🚨 HEALTH CHECK REQUESTED! 🚨🚨🚨`);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      port: PORT
    });
  });

  // Get available commands for a guild
  app.get("/api/guilds/:guildId/commands", async (req, res) => {
    try {
      var guildId = req.params.guildId;
      var guild = await client.guilds.fetch(guildId);

      // Get all available commands from the command registry
      var availableCommands = [];
      if (client.commandManager) {
        availableCommands.push(
          { name: 'warn', description: 'Warn a user for breaking rules', category: 'moderation' },
          { name: 'kick', description: 'Kick a user from the server', category: 'moderation' },
          { name: 'ban', description: 'Ban a user from the server', category: 'moderation' },
          { name: 'mute', description: 'Mute a user in the server', category: 'moderation' },
          { name: 'role', description: 'Manage user roles', category: 'moderation' },
          { name: 'custom', description: 'Execute custom commands', category: 'utilities' },
          { name: 'sendverify', description: 'Send verification message', category: 'verification' },
          { name: 'setverifylog', description: 'Set verification log channel', category: 'verification' },
          { name: 'feedback', description: 'Submit feedback', category: 'utilities' },
          { name: 'embed', description: 'Send embedded messages', category: 'utilities' }
        );
      }

      // Get current command states for this guild
      var commandStatesResult = await appDb.query(
        "SELECT command_name, enabled FROM guild_commands WHERE guild_id = ?",
        [guildId]
      );
      var commandStates = commandStatesResult[0];

      // Merge available commands with their states
      var commandsWithStates = availableCommands.map(function(cmd) {
        var state = commandStates.find(function(s) {
          return s.command_name === cmd.name;
        });
        return {
          name: cmd.name,
          description: cmd.description,
          category: cmd.category,
          enabled: state ? (state.enabled === 1) : true // Default to enabled if not set
        };
      });

      res.json({
        success: true,
        guildId,
        commands: commandsWithStates
      });

    } catch (error) {
      console.error('[COMMANDS-API] Error getting commands:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get command permissions (admin vs guild level controls)
  app.get("/api/guilds/:guildId/command-permissions", async (req, res) => {
    try {
      var guildId = req.params.guildId;
      var guild = await client.guilds.fetch(guildId);

      // Get all available commands from the database
      var allCommandsResult = await appDb.query(
        "SELECT DISTINCT command_name, feature_name FROM guild_commands WHERE guild_id = ?",
        [guildId]
      );
      var allCommands = allCommandsResult[0];

      var allFeatures = [
        'moderation', 'custom_commands', 'embedded_messages', 'reaction_roles', 'verification_system', 'feedback_system'
      ];

      // Get current command states for this guild
      var commandStatesResult = await appDb.query(
        "SELECT command_name, feature_name, enabled FROM guild_commands WHERE guild_id = ?",
        [guildId]
      );
      var commandStates = commandStatesResult[0];

      // Get current feature states for this guild
      var featureStatesResult = await appDb.query(
        "SELECT feature_name, enabled FROM guild_features WHERE guild_id = ?",
        [guildId]
      );
      var featureStates = featureStatesResult[0];

      // Build permission object
      var permissions = {
        commands: {},
        features: {}
      };

      // Process commands
      allCommands.forEach(function(cmd) {
        var guildState = commandStates.find(function(s) {
          return s.command_name === cmd.command_name;
        });
        
        // Use feature_name from database instead of hardcoded mapping
        var parentFeature = cmd.feature_name;
        
        var featureState = featureStates.find(function(s) {
          return s.feature_name === parentFeature;
        });

        // Commands are enabled if they're enabled at both admin and guild level
        var adminEnabled = featureState ? featureState.enabled : true;
        var guildEnabled = guildState ? guildState.enabled : true;

        permissions.commands[cmd.command_name] = {
          adminEnabled: adminEnabled,
          guildEnabled: guildEnabled,
          canModify: adminEnabled // Can only modify if admin allows it
        };
      });

      // Process features
      allFeatures.forEach(function(feature) {
        var featureState = featureStates.find(function(s) {
          return s.feature_name === feature;
        });

        // Features are enabled if they're enabled at both admin and guild level
        var adminEnabled = featureState ? featureState.enabled : true;
        var guildEnabled = featureState ? featureState.enabled : true;

        permissions.features[feature] = {
          adminEnabled: adminEnabled,
          guildEnabled: guildEnabled,
          canModify: adminEnabled // Can only modify if admin allows it
        };
      });

      res.json(permissions);

    } catch (error) {
      console.error('[PERMISSIONS-API] Error getting permissions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update command states for a guild
  app.post("/api/guilds/:guildId/commands", async (req, res) => {
    try {
      var guildId = req.params.guildId;
      var commands = req.body.commands;

      console.log(`[BOT-COMMANDS-API] Received command update for guild ${guildId}:`, commands);

      if (!Array.isArray(commands)) {
        console.error('[BOT-COMMANDS-API] Commands must be an array, received:', typeof commands);
        return res.status(400).json({ error: 'Commands must be an array' });
      }

      var guild = await client.guilds.fetch(guildId);
      console.log(`[BOT-COMMANDS-API] Fetched guild: ${guild.name} (${guild.id})`);

      // Update each command state
      for (var i = 0; i < commands.length; i++) {
        var cmd = commands[i];
        console.log(`[BOT-COMMANDS-API] Updating command ${cmd.command_name} to ${cmd.enabled ? 'enabled' : 'disabled'}`);
        
        var result = await appDb.query(
          `INSERT INTO guild_commands (guild_id, command_name, feature_name, enabled)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), feature_name = VALUES(feature_name), updated_at = CURRENT_TIMESTAMP`,
          [guildId, cmd.command_name, cmd.feature_name, cmd.enabled ? 1 : 0]
        );
        
        console.log(`[BOT-COMMANDS-API] Database result for ${cmd.command_name}:`, result);
      }

      // Trigger command update
      if (client.commandManager) {
        console.log(`[BOT-COMMANDS-API] Triggering command manager update for guild ${guildId}`);
        // Extract enabled commands as features array
        var enabledCommands = commands.filter(cmd => cmd.enabled).map(cmd => cmd.command_name);
        console.log(`[BOT-COMMANDS-API] Enabled commands:`, enabledCommands);
        await client.commandManager.updateGuildCommands(guildId, enabledCommands);
      } else {
        console.log(`[BOT-COMMANDS-API] No command manager available`);
      }

      console.log(`[BOT-COMMANDS-API] Successfully updated ${commands.length} commands for guild ${guildId}`);
      res.json({
        success: true,
        message: `Updated ${commands.length} commands for guild ${guildId}`
      });

    } catch (error) {
      console.error('[BOT-COMMANDS-API] Error updating commands:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  });

  app.post("/api/commands", async (req, res) => {
    try {
      var guildId = req.body.guildId;
      var action = req.body.action;
      var features = req.body.features;
      
      console.log(`[COMMAND-SERVER] Received command update:`, { guildId, action, features });

      if (!guildId || !action || !features) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get the command manager from the client
      const commandManager = req.client.commandManager;
      if (!commandManager) {
        return res.status(500).json({ error: 'Command manager not available' });
      }

      // Update commands for the guild
      var result = await commandManager.updateGuildCommands(guildId, features);
      
      res.json({ success: true, result });

    } catch (error) {
      console.error('[COMMAND-SERVER] Error processing command update:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get("/api/commands", async (req, res) => {
    try {
      var guildId = req.query.guildId;

      if (!guildId) {
        return res.status(400).json({ error: 'Missing guildId parameter' });
      }

      // Get the command manager from the client
      const commandManager = req.client.commandManager;
      if (!commandManager) {
        return res.status(500).json({ error: 'Command manager not available' });
      }

      // Get current commands for the guild
      const commands = commandManager.getGuildCommands(guildId);
      
      res.json({ success: true, guildId, commands });

    } catch (error) {
      console.error('[COMMAND-SERVER] Error getting commands:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all guilds where the bot is installed
  app.get("/api/guilds", async (_req, res) => {
    try {
      var guildsResult = await appDb.query("SELECT guild_id, guild_name, status FROM guilds WHERE status = 'active'");
      var rows = guildsResult[0];
      
      // Get detailed guild info including member and role counts
      // Filter out guilds that the bot can no longer access
      var guilds = [];

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        try {
          console.log(`🔍 Fetching details for guild: ${row.guild_name} (${row.guild_id})`);
          var guild = await client.guilds.fetch(row.guild_id);
          console.log(`✅ Fetched guild: ${guild.name}, members: ${guild.memberCount}, roles: ${guild.roles.cache.size}`);

          await guild.roles.fetch();

          // Update the database with fresh member count
          try {
            await appDb.query(
              "UPDATE guilds SET member_count = ?, member_count_updated_at = NOW() WHERE guild_id = ?",
              [guild.memberCount || 0, row.guild_id]
            );
            console.log(`💾 Updated member count for ${row.guild_name}: ${guild.memberCount}`);
          } catch (dbError) {
            console.warn(`⚠️ Could not update member count for ${row.guild_name}:`, dbError.message);
          }

          // Update status to active if it was previously inactive
          if (row.status !== 'active') {
            try {
              await appDb.query("UPDATE guilds SET status = 'active', updated_at = NOW() WHERE guild_id = ?", [row.guild_id]);
            } catch (dbError) {
              console.warn(`⚠️ Could not update status for ${row.guild_name}:`, dbError.message);
            }
          }

          guilds.push({
            guild_id: row.guild_id,
            guild_name: row.guild_name,
            status: 'active',
            memberCount: guild.memberCount || 0,
            roleCount: guild.roles.cache.size || 0,
            iconUrl: guild.iconURL ? guild.iconURL({ size: 128, extension: "png" }) : null,
            createdAt: guild.createdAt ? guild.createdAt.toISOString() : null
          });
        } catch (err) {
          // Mark guild as inactive since we can't access it
          try {
            await appDb.query("UPDATE guilds SET status = 'inactive', updated_at = NOW() WHERE guild_id = ?", [row.guild_id]);
          } catch (dbError) {
            console.warn(`⚠️ Could not mark ${row.guild_name} as inactive:`, dbError.message);
          }
          // Skip this guild from results
        }
      }
      
      res.json(guilds);
    } catch (err) {
      console.error("guilds endpoint error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Mount reaction roles API (non-prefixed to match UI proxy expectations)
  try {
    const reactionRoles = require('./api/reactionRoles');
    app.use('/guilds/:guildId/reaction-roles', reactionRoles);
  } catch {}

  // Mount embedded messages API (non-prefixed to match UI proxy expectations)
  try {
    const embeddedMessages = require('./api/embeddedMessages');
    app.use('/guilds/:guildId/embedded-messages', embeddedMessages);
  } catch {}

  // Mount custom commands API (non-prefixed to match UI proxy expectations)
  try {
    const customCommands = require('./api/customCommands');
    app.use('/guilds/:guildId/custom-commands', customCommands);
  } catch {}

  // Mount guild management API (non-prefixed to match UI proxy expectations)
  // Note: This must be mounted AFTER the middleware that sets req.client
  try {
    console.log('[EXPRESS] Loading enable-premium route...');
    const enablePremiumRoute = require('./api/guilds/[guildId]/enable-premium/route');
    app.use('/guilds/:guildId', enablePremiumRoute);
    console.log('[EXPRESS] ✅ Successfully mounted enable-premium route at /guilds/:guildId');
  } catch (error) {
    console.error('[EXPRESS] ❌ Failed to load enable-premium route:', error);
  }

  // ---- Helpers ----
  function toAvatarUrl(user, size = 64) {
    try {
      if (user && typeof user.displayAvatarURL === "function") {
        return user.displayAvatarURL({ size, extension: "png" });
      }
    } catch {}
    // Discord default “embed” avatar
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }

  async function buildFeatureFlags(guildId) {
    var features = {};
    try {
      const [rows] = await appDb.query(
        "SELECT feature_name, enabled FROM guild_features WHERE guild_id = ?",
        [guildId]
      );
      for (const row of rows) {
        features[row.feature_name] = row.enabled === 1 || row.enabled === "1";
      }
    } catch {
      // ignore
    }
    return features;
  }

  async function mapAccountsAndGroups() {
    const [accounts] = await fivemDb.query(
      "SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
    );
    const [extGroups] = await fivemDb.query(
      "SELECT accountid, `group` FROM accounts_groups"
    );

    var accountByDiscord = new Map(); // discordUserId -> { accountid }
    for (const r of accounts) {
      accountByDiscord.set(String(r.discord), { accountid: String(r.accountid) });
    }

    const groupsByAccount = new Map(); // accountid -> [group,...]
    for (const g of extGroups) {
      const key = String(g.accountid);
      if (!groupsByAccount.has(key)) groupsByAccount.set(key, []);
      groupsByAccount.get(key).push(g.group);
    }

    return { accountByDiscord, groupsByAccount };
  }

  // User hierarchy validation function
  function validateUserHierarchy(actor, target, action, roleToAssign = null) {
    try {
      // Guild owner can always perform actions
      if (actor.id === actor.guild.ownerId) {
        return null; // No error, owner can do anything
      }

      // Target is guild owner - only owner can modify owner
      if (target.id === actor.guild.ownerId) {
        return "Cannot modify server owner";
      }

      // Get highest roles for both users
      const actorHighestRole = actor.roles.highest;
      const targetHighestRole = target.roles.highest;

      // If we're assigning a specific role, check if actor can assign that role
      if (roleToAssign && action === 'add_role') {
        console.log(`[HIERARCHY-VALIDATION] Checking role assignment: Actor highest role "${actorHighestRole.name}" (pos: ${actorHighestRole.position}) vs Role to assign "${roleToAssign.name}" (pos: ${roleToAssign.position})`);

        // Actor must have higher role position than the role they're trying to assign
        if (actorHighestRole.position <= roleToAssign.position) {
          console.log(`[HIERARCHY-VALIDATION] BLOCKING ${action}: Actor cannot assign role at or above their level`);
          return `You cannot assign roles that are at or above your highest role. Your highest role: "${actorHighestRole.name}" (position: ${actorHighestRole.position}), Role to assign: "${roleToAssign.name}" (position: ${roleToAssign.position})`;
        }

        console.log(`[HIERARCHY-VALIDATION] ALLOWED ${action}: Actor can assign this role`);
      }

      // For removal, actor must have higher role than target
      if (action === 'remove_role') {
        // Actor must have higher role than target (cannot modify equal or higher roles)
        if (actorHighestRole.position <= targetHighestRole.position) {
          const targetPos = targetHighestRole.position;
          const actorPos = actorHighestRole.position;
          console.log(`[HIERARCHY-VALIDATION] Blocking ${action}: Actor role "${actorHighestRole.name}" (pos: ${actorPos}) vs Target role "${targetHighestRole.name}" (pos: ${targetPos})`);
          return `You cannot ${action.replace('_', ' ')} users with equal or higher roles than you. Your highest role: "${actorHighestRole.name}" (position: ${actorPos}), Target's highest role: "${targetHighestRole.name}" (position: ${targetPos})`;
        }
      }

      // Actor must have required permissions
      const requiredPermissions = ['ManageRoles'];
      if (!requiredPermissions.every(perm => actor.permissions.has(perm))) {
        return `You need the following permissions to ${action.replace('_', ' ')} roles: ${requiredPermissions.join(', ')}`;
      }

      return null; // No error, validation passed
    } catch (error) {
      console.error('Error validating user hierarchy:', error);
      return "Error validating permissions";
    }
  }

  // Safe role assignment with hierarchy validation
  async function safeAssignRole(member, role, reason = 'Role assignment') {
    try {
      // For automated systems (no actor), check if bot can assign the role
      if (!role.editable) {
        console.log(`[SAFE-ASSIGN] Cannot assign role ${role.name} - role is not editable by bot`);
        return false;
      }

      console.log(`[SAFE-ASSIGN] Assigning role ${role.name} to user ${member.user.tag} - ${reason}`);
      await member.roles.add(role, reason);
      return true;
    } catch (error) {
      console.error(`[SAFE-ASSIGN] Failed to assign role ${role.name} to user ${member.user.tag}:`, error);
      return false;
    }
  }

  // Safe role removal with hierarchy validation
  async function safeRemoveRole(member, role, reason = 'Role removal') {
    try {
      if (!role.editable) {
        console.log(`[SAFE-REMOVE] Cannot remove role ${role.name} - role is not editable by bot`);
        return false;
      }

      console.log(`[SAFE-REMOVE] Removing role ${role.name} from user ${member.user.tag} - ${reason}`);
      await member.roles.remove(role, reason);
      return true;
    } catch (error) {
      console.error(`[SAFE-REMOVE] Failed to remove role ${role.name} from user ${member.user.tag}:`, error);
      return false;
    }
  }

  function applyFilters(members, { q, role, group }) {
    let out = members;
    if (q) {
      const s = String(q).toLowerCase();
      out = out.filter(
        (m) =>
          m.username.toLowerCase().includes(s) ||
          String(m.discordUserId).includes(s)
      );
    }
    if (role) {
      const roleIds = String(role).split(",");
      out = out.filter((m) => roleIds.some((r) => m.roleIds.includes(r)));
    }
    if (group) {
      const wanted = String(group).split(",");
      out = out.filter((m) => (m.groups || []).some((g) => wanted.includes(g)));
    }
    return out;
  }

  function paginate(members, { limit = 100, after }) {
    const lim = Math.max(1, Math.min(1000, Number(limit) || 100));
    const sorted = members
      .slice()
      .sort((a, b) => BigInt(a.discordUserId) - BigInt(b.discordUserId));
    let startIdx = 0;
    if (after) {
      const aid = BigInt(after);
      startIdx = sorted.findIndex((m) => BigInt(m.discordUserId) > aid);
      if (startIdx < 0) startIdx = sorted.length;
    }
    const pageItems = sorted.slice(startIdx, startIdx + lim);
    const nextAfter =
      sorted.length > startIdx + lim
        ? String(sorted[startIdx + lim - 1].discordUserId)
        : null;
    return { items: pageItems, nextAfter, total: sorted.length };
  }

  // ---- Routes ----

  // Features - premium gates etc.
  app.get("/api/guilds/:guildId/features", async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const features = await buildFeatureFlags(guildId);
      res.json({ guildId, features });
    } catch (err) {
      console.error("features error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Guilds list - REMOVED: This was returning ALL Discord guilds instead of just bot-installed ones
  // The endpoint above (line 37-46) now handles this correctly by querying the database

  // Roles for a guild
  app.get("/api/guilds/:guildId/roles", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.roles.fetch();
      const me = guild.members.me;
      
      // Try to get permissions from Discord REST API directly
      let rolesWithPermissions = [];
      try {
        // Use Discord REST API to get roles with permissions
        const response = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/roles`, {
          headers: {
            'Authorization': `Bot ${client.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const discordRoles = await response.json();
          console.log(`🔍 Discord API returned ${discordRoles.length} roles for guild ${guild.name}`);
          console.log(`📋 Sample role permissions:`, discordRoles.slice(0, 3).map(r => ({ name: r.name, permissions: r.permissions })));
          
          rolesWithPermissions = discordRoles.map((role) => ({
            guildId: guild.id,
            roleId: role.id,
            name: role.name,
            color: role.hexColor || null,
            position: role.position,
            managed: role.managed,
            editableByBot:
              typeof role.editable === "boolean"
                ? role.editable
                : me
                ? role.position < me.roles.highest.position
                : false,
            permissions: role.permissions || [], // Discord API permissions
          }));
        } else {
          throw new Error(`Discord API returned ${response.status}`);
        }
      } catch (discordApiError) {
        console.warn("Failed to fetch from Discord API, falling back to cache:", discordApiError.message);
        // Fallback to cache method
        rolesWithPermissions = guild.roles.cache
          .sort((a, b) => b.position - a.position)
          .map((role) => ({
            guildId: guild.id,
            roleId: role.id,
            name: role.name,
            color: role.hexColor || null,
            position: role.position,
            managed: role.managed,
            editableByBot:
              typeof role.editable === "boolean"
                ? role.editable
                : me
                ? role.position < me.roles.highest.position
                : false,
            permissions: role.permissions.toArray(), // Cache permissions
          }));
      }
      
      // Sort by hierarchy (highest first)
      const roles = rolesWithPermissions.sort((a, b) => b.position - a.position);
      res.json(roles);
    } catch (err) {
      console.error("roles error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Members (legacy, full list) — includes avatarUrl
  app.get("/api/guilds/:guildId/members", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.members.fetch();

      const { accountByDiscord, groupsByAccount } = await mapAccountsAndGroups();

      let members = guild.members.cache.map((m) => {
        const acct = accountByDiscord.get(m.id);
        const accountid = acct ? acct.accountid : null;
        const groups =
          accountid && groupsByAccount.has(accountid)
            ? groupsByAccount.get(accountid)
            : [];
        return {
          guildId: guild.id,
          discordUserId: m.id,
          username: (m.user && m.user.username) || (m.user && m.user.globalName) || "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: (m.user && m.user.avatar) || null, // Discord avatar hash (string or null)
          avatarUrl: toAvatarUrl(m.user, 64), // Full CDN URL for avatar (always present, fallback to default)
            joinedAt: m.joinedAt ?? null, // Date the user joined the server
        };
      });

      members = applyFilters(members, {
        q: req.query.q,
        role: req.query.role,
        group: req.query.group,
      });

      res.json(members);
    } catch (err) {
      console.error("members error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Members (paged) — shape: { members, page:{ nextAfter, total? }, source, debug? }
  app.get("/api/guilds/:guildId/members-paged", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      // fetch all or partial: for simplicity, fetch all once; gateway/rest differentiation skipped here
      await guild.members.fetch();

      const { accountByDiscord, groupsByAccount } = await mapAccountsAndGroups();

      let members = guild.members.cache.map((m) => {
        const acct = accountByDiscord.get(m.id);
        const accountid = acct ? acct.accountid : null;
        const groups =
          accountid && groupsByAccount.has(accountid)
            ? groupsByAccount.get(accountid)
            : [];
        return {
          guildId: guild.id,
          discordUserId: m.id,
          username: (m.user && m.user.username) || (m.user && m.user.globalName) || "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: (m.user && m.user.avatar) || null, // Discord avatar hash (string or null)
          avatarUrl: toAvatarUrl(m.user, 64), // Full CDN URL for avatar (always present, fallback to default)
        };
      });

      members = applyFilters(members, {
        q: req.query.q,
        role: req.query.role,
        group: req.query.group,
      });

      const limit = Number(req.query.limit) || 100;
      const after = req.query.after ? String(req.query.after) : null;
      const { items, nextAfter, total } = paginate(members, { limit, after });

      const debug = req.query.debug ? { limit, after, count: members.length } : undefined;

      res.json({
        members: items,
        page: { nextAfter, total: req.query.all ? total : null },
        source: "gateway",
        debug,
      });
    } catch (err) {
      console.error("members-paged error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Members search — ?q=...&limit=25
  app.get("/api/guilds/:guildId/members-search", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.members.fetch();

      const { accountByDiscord, groupsByAccount } = await mapAccountsAndGroups();

      const q = String(req.query.q || "").toLowerCase();
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 25));

      let members = guild.members.cache.map((m) => {
        const acct = accountByDiscord.get(m.id);
        const accountid = acct ? acct.accountid : null;
        const groups =
          accountid && groupsByAccount.has(accountid)
            ? groupsByAccount.get(accountid)
            : [];
        return {
          guildId: guild.id,
          discordUserId: m.id,
          username: (m.user && m.user.username) || (m.user && m.user.globalName) || "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: (m.user && m.user.avatar) || null, // Discord avatar hash (string or null)
          avatarUrl: toAvatarUrl(m.user, 64), // Full CDN URL for avatar (always present, fallback to default)
        };
      });

      if (q) {
        members = members.filter(
          (m) =>
            m.username.toLowerCase().includes(q) ||
            String(m.discordUserId).includes(q)
        );
      }

      members = members
        .sort((a, b) => BigInt(a.discordUserId) - BigInt(b.discordUserId))
        .slice(0, limit);

      res.json(members);
    } catch (err) {
      console.error("members-search error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // External groups passthrough
  app.get("/api/external/groups", async (_req, res) => {
    try {
      const [rows] = await fivemDb.query(
        "SELECT accountid, `group`, assigned_on, assigned_by FROM accounts_groups"
      );
      const groups = rows.map((r) => ({
        accountid: String(r.accountid),
        group: r.group,
        assigned_on: r.assigned_on,
        assigned_by: String(r.assigned_by),
      }));
      res.json(groups);
    } catch (err) {
      console.error("ext groups error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Guilds endpoint for embedded messages builder
  app.get("/guilds/:guildId/guilds", async (req, res) => {
    try {
      console.log("🔍 Guilds endpoint called with guildId:", req.params.guildId);
      const guildId = req.params.guildId;
      
      // Get the group ID for this guild
      console.log("🔍 Querying database for group_id...");
      const [guildRows] = await appDb.query(
        "SELECT group_id FROM guilds WHERE guild_id = ?",
        [guildId]
      );
      console.log("🔍 Database result:", guildRows);
      
      if (guildRows.length === 0 || !guildRows[0].group_id) {
        console.log("🔍 No group found, returning empty array");
        return res.json({ guilds: [] });
      }
      
      const groupId = guildRows[0].group_id;
      console.log("🔍 Found group_id:", groupId);
      
      // Get all guilds in the same group
      console.log("🔍 Querying for guilds in group...");
      const [groupGuilds] = await appDb.query(`
        SELECT 
          g.guild_id,
          g.guild_name,
          g.member_count,
          g.premium
        FROM guilds g
        WHERE g.group_id = ? AND g.guild_id != ?
      `, [groupId, guildId]);
      console.log("🔍 Group guilds found:", groupGuilds.length);
      
      // Get Discord guild objects for each grouped guild
      console.log("🔍 Fetching Discord guild objects...");
      const guildsWithChannels = await Promise.all(groupGuilds.map(async (guildRow) => {
        try {
          console.log(`🔍 Fetching Discord guild: ${guildRow.guild_id}`);
          const guild = await client.guilds.fetch(guildRow.guild_id);
          
          console.log(`🔍 Guild ${guildRow.guild_id} fetched, channels cache size before fetch: ${guild.channels.cache.size}`);
          
          // Ensure channels are fully loaded
          await guild.channels.fetch();
          
          console.log(`🔍 Guild ${guildRow.guild_id} channels fetched, cache size after fetch: ${guild.channels.cache.size}`);
          console.log(`🔍 All channel types:`, Array.from(guild.channels.cache.values()).map(ch => ({ id: ch.id, name: ch.name, type: ch.type })));
          
          // Get channels for this guild - use the same logic as the current server endpoint
          const channels = guild.channels.cache
            .filter(channel => channel.type === 0 || channel.type === 5) // Text channels (0) and forum channels (5)
            .map(channel => ({
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: channel.position
            }))
            .sort((a, b) => a.position - b.position);
          
          console.log(`✅ Successfully fetched guild ${guildRow.guild_id} with ${channels.length} text and forum channels`);
          console.log(`🔍 Text and forum channels:`, channels.map(ch => `#${ch.name} (${ch.id}) [type: ${ch.type}]`));
          
          return {
            id: guildRow.guild_id,
            name: guildRow.guild_name || guild.name,
            memberCount: guildRow.member_count || guild.memberCount || 0,
            premium: Boolean(guildRow.premium),
            channels: channels
          };
        } catch (err) {
          console.warn(`⚠️ Could not fetch guild ${guildRow.guild_id}:`, err.message);
          // Return a fallback guild object instead of null
          return {
            id: guildRow.guild_id,
            name: guildRow.guild_name || `Guild ${guildRow.guild_id}`,
            memberCount: guildRow.member_count || 0,
            premium: Boolean(guildRow.premium),
            channels: [] // Empty channels array as fallback
          };
        }
      }));
      
      console.log("🔍 Final result:", guildsWithChannels.length, "guilds");
      // No need to filter out failed guilds since we're providing fallbacks
      res.json({ guilds: guildsWithChannels });
    } catch (err) {
      console.error("❌ Guilds endpoint error:", err);
      console.error("❌ Error stack:", err.stack);
      // Return empty array instead of 500 error
      res.json({ guilds: [] });
    }
  });

  // Groups endpoint for embedded messages builder
  app.get("/guilds/:guildId/groups", async (req, res) => {
    try {
      const guildId = req.params.guildId;
      
      // Get the group information for this guild
      const [groupRows] = await appDb.query(`
        SELECT 
          sg.id,
          sg.name,
          sg.description,
          sg.created_at,
          sg.updated_at
        FROM server_groups sg
        INNER JOIN guilds g ON g.group_id = sg.id
        WHERE g.guild_id = ?
      `, [guildId]);
      
      if (groupRows.length === 0) {
        return res.json({ groups: [] });
      }
      
      const group = groupRows[0];
      
      // Get all guilds in this group
      const [groupGuilds] = await appDb.query(`
        SELECT 
          g.guild_id,
          g.guild_name,
          g.member_count,
          g.premium
        FROM guilds g
        WHERE g.group_id = ?
      `, [group.id]);
      
      // Get Discord guild objects and channels for each guild in the group
      const guildsWithChannels = await Promise.all(groupGuilds.map(async (guildRow) => {
        try {
          const guild = await client.guilds.fetch(guildRow.guild_id);
          
          // Ensure channels are fully loaded
          await guild.channels.fetch();
          
          // Get channels for this guild - use the same logic as the current server endpoint
          const channels = guild.channels.cache
            .filter(channel => channel.type === 0 || channel.type === 5) // Text channels (0) and forum channels (5)
            .map(channel => ({
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: channel.position
            }))
            .sort((a, b) => a.position - b.position);
          
          return {
            id: guildRow.guild_id,
            name: guildRow.guild_name || guild.name,
            memberCount: guildRow.member_count || guild.memberCount || 0,
            premium: Boolean(guildRow.premium),
            channels: channels
          };
        } catch (err) {
          console.warn(`Could not fetch guild ${guildRow.guild_id}:`, err.message);
          // Return a fallback guild object instead of null
          return {
            id: guildRow.guild_id,
            name: guildRow.guild_name || `Guild ${guildRow.guild_id}`,
            memberCount: guildRow.member_count || 0,
            premium: Boolean(guildRow.premium),
            channels: [] // Empty channels array as fallback
          };
        }
      }));
      
      // No need to filter out failed guilds since we're providing fallbacks
      const groupWithGuilds = {
        id: group.id,
        name: group.name,
        description: group.description,
        created_at: group.created_at,
        updated_at: group.updated_at,
        guilds: guildsWithChannels
      };
      
      res.json({ groups: [groupWithGuilds] });
    } catch (err) {
      console.error("groups endpoint error", err);
      // Return empty array instead of 500 error
      res.json({ groups: [] });
    }
  });

  // Channels endpoint for embedded messages builder
  app.get("/guilds/:guildId/channels", async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = await client.guilds.fetch(guildId);
      
      console.log(`🔍 Current server channels - Guild ${guildId} fetched, channels cache size before fetch: ${guild.channels.cache.size}`);
      
      // Ensure channels are fully loaded
      await guild.channels.fetch();
      
      console.log(`🔍 Current server channels - Guild ${guildId} channels fetched, cache size after fetch: ${guild.channels.cache.size}`);
      console.log(`🔍 Current server - All channel types:`, Array.from(guild.channels.cache.values()).map(ch => ({ id: ch.id, name: ch.name, type: ch.type })));
      
      // Fetch all channels
      const channels = guild.channels.cache
        .filter(channel => channel.type === 0 || channel.type === 5) // Text channels (0) and forum channels (5)
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: channel.position
        }))
        .sort((a, b) => a.position - b.position);
      
      console.log(`✅ Current server channels - Successfully fetched ${channels.length} text and forum channels`);
      console.log(`🔍 Current server - Text and forum channels:`, channels.map(ch => `#${ch.name} (${ch.id}) [type: ${ch.type}]`));
      
      res.json({ channels });
    } catch (err) {
      console.error("channels endpoint error", err);
      res.status(500).json({ error: err.message });
    }
  });



  // Add role to user (actor accepted as query ?actor=ID)
  app.post("/api/guilds/:guildId/members/:userId/roles/:roleId", async (req, res) => {
    try {
      const { guildId, userId, roleId } = req.params;
      const actorId = req.query.actor ? String(req.query.actor) : null;
      const guild = await client.guilds.fetch(guildId);

      // Handle member fetch with proper error handling
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (memberError) {
        if (memberError.code === 10007) { // Unknown Member
          console.log(`[API-ROLE-ADD] User ${userId} is no longer a member of guild ${guildId}`);
          return res.status(404).json({
            error: "user_not_found",
            message: "This user is no longer a member of the server. They may have left or been removed.",
            userId: userId
          });
        }
        throw memberError;
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) return res.status(404).json({ error: "role_not_found" });
      if (!role.editable)
        return res.status(400).json({ error: "uneditable_role" });

      // Validate actor hierarchy if provided
      if (actorId) {
        const actor = await guild.members.fetch(actorId).catch(() => null);
        if (actor) {
          const hierarchyError = validateUserHierarchy(actor, member, 'add_role', role);
          if (hierarchyError) {
            console.log(`[API-ROLE-ADD] BLOCKED: Actor ${actorId} cannot add role ${roleId} to user ${userId} - ${hierarchyError}`);
            return res.status(403).json({ error: hierarchyError });
          }
        }
      }

      console.log(`[API-ROLE-ADD] ALLOWED: Adding role ${roleId} (${role.name}) to user ${userId} by actor ${actorId}`);
      const success = await safeAssignRole(member, role, `Role added via web interface by user ${actorId}`);
      if (!success) {
        return res.status(500).json({ error: "Failed to assign role" });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("add role error", err);
      res.status(400).json({ error: err.message || "add_failed" });
    }
  });

  // Remove role from user (actor accepted as query ?actor=ID)
  app.delete("/api/guilds/:guildId/members/:userId/roles/:roleId", async (req, res) => {
    try {
      const { guildId, userId, roleId } = req.params;
      const actorId = req.query.actor ? String(req.query.actor) : null;
      const guild = await client.guilds.fetch(guildId);

      // Handle member fetch with proper error handling
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (memberError) {
        if (memberError.code === 10007) { // Unknown Member
          console.log(`[API-ROLE-REMOVE] User ${userId} is no longer a member of guild ${guildId}`);
          return res.status(404).json({
            error: "user_not_found",
            message: "This user is no longer a member of the server. They may have left or been removed.",
            userId: userId
          });
        }
        throw memberError;
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) return res.status(404).json({ error: "role_not_found" });
      if (!role.editable)
        return res.status(400).json({ error: "uneditable_role" });

      // Validate actor hierarchy if provided
      if (actorId) {
        const actor = await guild.members.fetch(actorId).catch(() => null);
        if (actor) {
          const hierarchyError = validateUserHierarchy(actor, member, 'remove_role', role);
          if (hierarchyError) {
            console.log(`[API-ROLE-REMOVE] BLOCKED: Actor ${actorId} cannot remove role ${roleId} from user ${userId} - ${hierarchyError}`);
            return res.status(403).json({ error: hierarchyError });
          }
        }
      }

      console.log(`[API-ROLE-REMOVE] ALLOWED: Removing role ${roleId} (${role.name}) from user ${userId} by actor ${actorId}`);
      const success = await safeRemoveRole(member, role, `Role removed via web interface by user ${actorId}`);
      if (!success) {
        return res.status(500).json({ error: "Failed to remove role" });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("remove role error", err);
      res.status(400).json({ error: err.message || "remove_failed" });
    }
  });

  // Role Permissions Management API
  // GET /api/guilds/:guildId/role-permissions - Get current role permissions
  app.get("/api/guilds/:guildId/role-permissions", async (req, res) => {
    try {
      const { guildId } = req.params;
      const guild = await client.guilds.fetch(guildId);

      // Get stored role permissions (for now, return empty - can be extended with database)
      const permissions = [];

      res.json({
        guildId,
        permissions
      });
    } catch (err) {
      console.error("get role permissions error", err);
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });

  // PUT /api/guilds/:guildId/role-permissions - Update role permissions
  app.put("/api/guilds/:guildId/role-permissions", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { permissions } = req.body;

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: "permissions must be an array" });
      }

      const guild = await client.guilds.fetch(guildId);

      // Validate permissions format
      for (const perm of permissions) {
        if (!perm.roleId || typeof perm.canUseApp !== 'boolean') {
          return res.status(400).json({ error: "Invalid permission format" });
        }

        // Verify role exists
        const role = await guild.roles.fetch(perm.roleId).catch(() => null);
        if (!role) {
          return res.status(400).json({ error: `Role ${perm.roleId} not found` });
        }
      }

      // Store permissions (for now, just return success - can be extended with database)
      console.log(`[ROLE-PERMISSIONS] Updated permissions for guild ${guildId}:`, permissions);

      res.json({
        success: true,
        message: "Role permissions updated successfully"
      });
    } catch (err) {
      console.error("update role permissions error", err);
      res.status(500).json({ error: "Failed to update role permissions" });
    }
  });

  // POST /api/guilds/:guildId/role-permissions/check - Check user permissions
  app.post("/api/guilds/:guildId/role-permissions/check", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { userId, userRoles } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const guild = await client.guilds.fetch(guildId);

      // Get the user member object
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (memberError) {
        if (memberError.code === 10007) { // Unknown Member
          console.log(`[USER-INFO] User ${userId} is no longer a member of guild ${guildId}`);
          return res.status(404).json({
            error: "user_not_found",
            message: "This user is no longer a member of the server. They may have left or been removed.",
            userId: userId
          });
        }
        console.error(`[USER-INFO] Error fetching member ${userId}:`, memberError);
        return res.status(404).json({ error: "User not found in guild" });
      }

      // Check if user is guild owner
      const isOwner = member.id === guild.ownerId;

      // Check if user has administrator permission
      const hasAdminPermission = member.permissions.has('Administrator');

      // Check if any of user's roles have app access (for now, default logic)
      // This can be extended with database-stored role permissions
      const hasRoleAccess = isOwner || hasAdminPermission || false;

      // Determine overall app access
      const canUseApp = isOwner || hasAdminPermission || hasRoleAccess;

      console.log(`[PERMISSION-CHECK] User ${userId} in guild ${guildId}:`, {
        isOwner,
        hasAdminPermission,
        hasRoleAccess,
        canUseApp
      });

      res.json({
        canUseApp,
        isOwner,
        hasRoleAccess,
        userId,
        userRoles: userRoles || []
      });
    } catch (err) {
      console.error("check user permissions error", err);
      res.status(500).json({ error: "Failed to check user permissions" });
    }
  });

  // Periodic member count sync job (runs every 6 hours)
  const syncMemberCounts = async () => {
    try {
      console.log('🔄 Starting periodic member count sync...');
      const [rows] = await appDb.query("SELECT guild_id, guild_name, member_count FROM guilds WHERE status = 'active' OR status IS NULL");

      console.log(`📊 Found ${rows.length} active guilds to sync`);
      let updatedCount = 0;

      for (const row of rows) {
        try {
          const guild = await client.guilds.fetch(row.guild_id);
          const currentCount = guild.memberCount || 0;
          const previousCount = row.member_count || 0;

          // Only update if the count has changed
          if (currentCount !== previousCount) {
            await appDb.query(
              "UPDATE guilds SET member_count = ?, member_count_updated_at = NOW() WHERE guild_id = ?",
              [currentCount, row.guild_id]
            );
            console.log(`📈 Updated ${row.guild_name}: ${previousCount} → ${currentCount} members`);
            updatedCount++;
          }
        } catch (err) {
          console.warn(`⚠️ Could not sync member count for ${row.guild_name}:`, err.message);
        }
      }

      console.log(`✅ Periodic sync completed: Updated ${updatedCount}/${rows.length} guilds`);
    } catch (error) {
      console.error('❌ Periodic member count sync failed:', error);
    }
  };

  // Start periodic sync (every 6 hours = 6 * 60 * 60 * 1000 ms)
  setInterval(syncMemberCounts, 6 * 60 * 60 * 1000);



  // Moderation Actions API
  app.post("/api/moderation/action", async (req, res) => {
    try {
      const { guildId, action, targetUserId, reason, duration } = req.body;

      if (!guildId || !action || !targetUserId) {
        return res.status(400).json({ error: "Missing required fields: guildId, action, targetUserId" });
      }

      console.log(`🔨 Performing moderation action: ${action} on ${targetUserId} in guild ${guildId}`);

      // Fetch the guild
      const guild = await client.guilds.fetch(guildId);
      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      // Fetch the target member
      let member;
      try {
        member = await guild.members.fetch(targetUserId);
      } catch (memberError) {
        if (memberError.code === 10007) { // Unknown Member
          console.log(`[MODERATION] User ${targetUserId} is no longer a member of guild ${guildId}`);
          return res.status(404).json({
            error: "user_not_found",
            message: "This user is no longer a member of the server. They may have left or been removed.",
            userId: targetUserId
          });
        }
        console.error(`[MODERATION] Error fetching member ${targetUserId}:`, memberError);
        return res.status(404).json({ error: "Member not found in guild" });
      }

      const cleanReason = reason || "No reason provided";

      try {
        switch (action) {
          case "ban":
            await guild.members.ban(targetUserId, { reason: cleanReason, deleteMessageSeconds: 604800 }); // 7 days
            console.log(`✅ Banned ${member.user.tag} from ${guild.name}`);
            break;

          case "unban":
            await guild.members.unban(targetUserId, cleanReason);
            console.log(`✅ Unbanned user ${targetUserId} from ${guild.name}`);
            break;

          case "kick":
            await member.kick(cleanReason);
            console.log(`✅ Kicked ${member.user.tag} from ${guild.name}`);
            break;

          case "timeout":
          case "mute":
            if (!duration) {
              return res.status(400).json({ error: "Duration required for timeout/mute" });
            }
            const timeoutDuration = duration * 1000; // Convert to milliseconds
            await member.timeout(timeoutDuration, cleanReason);
            console.log(`✅ Timed out ${member.user.tag} for ${duration}s in ${guild.name}`);
            break;

          case "unmute":
            await member.timeout(null, cleanReason);
            console.log(`✅ Removed timeout from ${member.user.tag} in ${guild.name}`);
            break;

          case "warn":
            // Warnings are just logged, no direct Discord action
            console.log(`⚠️ Warned ${member.user.tag} in ${guild.name}: ${cleanReason}`);
            break;

          default:
            return res.status(400).json({ error: `Unsupported action: ${action}` });
        }

        res.json({
          success: true,
          message: `Successfully performed ${action} on ${member.user.tag}`,
          action,
          targetUser: member.user.tag,
          guild: guild.name
        });

      } catch (discordError) {
        console.error(`❌ Discord API error for ${action}:`, discordError);

        // Check if it's a permission error
        if (discordError.code === 50013) {
          return res.status(403).json({
            error: "Bot lacks required permissions to perform this action",
            details: "Missing permissions: " + (action === "ban" ? "Ban Members" :
                      action === "kick" ? "Kick Members" :
                      action === "timeout" || action === "mute" ? "Moderate Members" :
                      action === "unban" ? "Ban Members" : "Unknown")
          });
        }

        return res.status(500).json({
          error: "Failed to perform Discord action",
          details: discordError.message
        });
      }

    } catch (error) {
      console.error("❌ Moderation API error:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error.message
      });
    }
  });

  // Run initial sync after 30 seconds (to let bot fully connect)
  setTimeout(syncMemberCounts, 30000);

  // File watcher for command updates (fallback)
  const fs = require('fs');
  const path = require('path');
  const commandFile = path.join(process.cwd(), 'command-updates.json');
  let lastProcessedUpdate = null;

  // Function to process command updates from file
  async function processCommandUpdates() {
    try {
      if (!fs.existsSync(commandFile)) return;

      const updates = JSON.parse(fs.readFileSync(commandFile, 'utf8'));
      if (!Array.isArray(updates) || updates.length === 0) return;

      // Get the latest update
      const latestUpdate = updates[updates.length - 1];
      
      // Check if we've already processed this update
      if (lastProcessedUpdate && lastProcessedUpdate.timestamp === latestUpdate.timestamp) {
        return;
      }

      console.log('[COMMAND-FILE] Processing command update from file:', latestUpdate);

      // Get the command manager from the client
      const commandManager = client.commandManager;
      if (!commandManager) {
        console.error('[COMMAND-FILE] Command manager not available');
        return;
      }

      // Process the update
      const result = await commandManager.updateGuildCommands(
        latestUpdate.guildId, 
        latestUpdate.features
      );

      console.log('[COMMAND-FILE] Command update processed successfully:', result);
      lastProcessedUpdate = latestUpdate;

    } catch (error) {
      console.error('[COMMAND-FILE] Error processing command updates:', error);
    }
  }

  // Check for command updates every 5 seconds
  setInterval(processCommandUpdates, 5000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚨🚨🚨 API SERVER LISTENING ON PORT ${PORT} 🚨🚨🚨`);
    console.log(`API server listening on port ${PORT}`);
  }).on('error', (err) => {
    console.error(`🚨🚨🚨 API SERVER ERROR ON PORT ${PORT} 🚨🚨🚨`);
    console.error('API server error:', err);
  });
};
