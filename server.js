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

  // Get all guilds where the bot is installed
  app.get("/api/guilds", async (_req, res) => {
    try {
      const [rows] = await appDb.query("SELECT guild_id, guild_name FROM guilds");
      
      // Get detailed guild info including member and role counts
      const guilds = await Promise.all(rows.map(async (row) => {
        try {
          console.log(`🔍 Fetching details for guild: ${row.guild_name} (${row.guild_id})`);
          const guild = await client.guilds.fetch(row.guild_id);
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
          
          return {
            guild_id: row.guild_id,
            guild_name: row.guild_name,
            memberCount: guild.memberCount || 0,
            roleCount: guild.roles.cache.size || 0,
            iconUrl: guild.iconURL ? guild.iconURL({ size: 128, extension: "png" }) : null,
            createdAt: guild.createdAt ? guild.createdAt.toISOString() : null
          };
        } catch (err) {
          console.error(`❌ Error fetching guild ${row.guild_name}:`, err.message);
          // Fallback if we can't fetch guild details
          return {
            guild_id: row.guild_id,
            guild_name: row.guild_name,
            memberCount: 0,
            roleCount: 0,
            iconUrl: null,
            createdAt: null
          };
        }
      }));
      
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
    const features = {};
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

    const accountByDiscord = new Map(); // discordUserId -> { accountid }
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
          username: m.user?.username ?? m.user?.globalName ?? "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: m.user?.avatar ?? null, // Discord avatar hash (string or null)
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
          username: m.user?.username ?? m.user?.globalName ?? "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: m.user?.avatar ?? null, // Discord avatar hash (string or null)
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
          username: m.user?.username ?? m.user?.globalName ?? "unknown",
          roleIds: Array.from(m.roles.cache.keys()),
          accountid,
          groups,
          avatar: m.user?.avatar ?? null, // Discord avatar hash (string or null)
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
      // const actor = req.query.actor ? String(req.query.actor) : null; // available if you need to audit
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(roleId);
      if (!role) return res.status(404).json({ error: "role_not_found" });
      if (!role.editable)
        return res.status(400).json({ error: "uneditable_role" });
      await member.roles.add(role);
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
      // const actor = req.query.actor ? String(req.query.actor) : null;
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(roleId);
      if (!role) return res.status(404).json({ error: "role_not_found" });
      if (!role.editable)
        return res.status(400).json({ error: "uneditable_role" });
      await member.roles.remove(role);
      res.json({ ok: true });
    } catch (err) {
      console.error("remove role error", err);
      res.status(400).json({ error: err.message || "remove_failed" });
    }
  });

  // Periodic member count sync job (runs every 6 hours)
  const syncMemberCounts = async () => {
    try {
      console.log('🔄 Starting periodic member count sync...');
      const [rows] = await appDb.query("SELECT guild_id, guild_name FROM guilds WHERE status != 'left' OR status IS NULL");
      
      let updatedCount = 0;
      for (const row of rows) {
        try {
          const guild = await client.guilds.fetch(row.guild_id);
          await appDb.query(
            "UPDATE guilds SET member_count = ?, member_count_updated_at = NOW() WHERE guild_id = ?",
            [guild.memberCount || 0, row.guild_id]
          );
          updatedCount++;
        } catch (err) {
          console.warn(`⚠️ Could not sync member count for ${row.guild_name}:`, err.message);
        }
      }
      
      console.log(`✅ Periodic sync completed: Updated ${updatedCount} guilds`);
    } catch (error) {
      console.error('❌ Periodic member count sync failed:', error);
    }
  };

  // Start periodic sync (every 6 hours = 6 * 60 * 60 * 1000 ms)
  setInterval(syncMemberCounts, 6 * 60 * 60 * 1000);
  
  // Run initial sync after 30 seconds (to let bot fully connect)
  setTimeout(syncMemberCounts, 30000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API server listening on port ${PORT}`);
  });
};
