// server.js
const express = require('express');
const { REST, Routes, PermissionsBitField } = require('discord.js');
const { fivemDb, appDb } = require('./config/database');

async function isFeatureEnabled(guildId, featureName) {
  const [rows] = await appDb.query(
    `SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_name = ? LIMIT 1`,
    [guildId, featureName]
  );
  if (!rows || rows.length === 0) return false;
  return String(rows[0].enabled) === '1';
}

function requireRoleManager(client) {
  return async (req, res, next) => {
    try {
      const { guildId, userId, roleId } = req.params;
      const callerId = String(req.header('x-user-id') || '');
      if (!callerId) return res.status(401).json({ error: 'missing_caller_id' });

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return res.status(404).json({ error: 'guild_not_found' });

      await guild.roles.fetch();
      const role = roleId ? guild.roles.cache.get(roleId) : null;

      const caller = await guild.members.fetch(callerId).catch(() => null);
      if (!caller) return res.status(403).json({ error: 'caller_not_in_guild' });

      const hasManageRoles =
        caller.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
        caller.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!hasManageRoles) return res.status(403).json({ error: 'missing_manage_roles' });

      if (role) {
        if (role.managed || role.id === guild.id) return res.status(400).json({ error: 'uneditable_role' });
        const bot = await guild.members.fetchMe();
        if (role.position >= bot.roles.highest.position) return res.status(400).json({ error: 'role_above_bot' });

        const callerIsAdmin = caller.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!callerIsAdmin && role.position >= caller.roles.highest.position) {
          return res.status(403).json({ error: 'role_above_caller' });
        }
      }

      if (userId) {
        const target = await guild.members.fetch(userId).catch(() => null);
        if (!target) return res.status(404).json({ error: 'member_not_found' });
        const callerIsAdmin = caller.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!callerIsAdmin && target.roles.highest.position >= caller.roles.highest.position) {
          return res.status(403).json({ error: 'target_above_or_equal_caller' });
        }
      }

      next();
    } catch (err) {
      console.error('requireRoleManager error:', err);
      res.status(500).json({ error: 'permission_check_failed' });
    }
  };
}

module.exports = function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3001;
  const rest = client?.rest ?? new REST({ version: '10' }).setToken(process.env.TOKEN);

  // CORS
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/guilds/:guildId/features', async (req, res) => {
    try {
      const { guildId } = req.params;
      const customGroups = await isFeatureEnabled(guildId, 'custom_groups');
      res.json({ guildId, features: { custom_groups: customGroups, premium_members: customGroups } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/guilds', async (_req, res) => {
    try {
      const guilds = await Promise.all(
        client.guilds.cache.map(async (g) => {
          const guild = await client.guilds.fetch(g.id);
          await guild.roles.fetch();
          const iconUrl = guild.iconURL ? guild.iconURL({ size: 128, extension: 'png' }) : null;
          return {
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount ?? 0,
            roleCount: guild.roles.cache.size ?? 0,
            iconUrl,
            premium: false,
            createdAt: guild.createdAt ? guild.createdAt.toISOString() : null,
          };
        })
      );
      res.json(guilds);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/guilds/:guildId/roles', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.roles.fetch();
      const me = await guild.members.fetchMe();
      const roles = guild.roles.cache.map((role) => ({
        guildId: guild.id,
        roleId: role.id,
        name: role.name,
        color: role.hexColor || null,
        managed: role.managed,
        editableByBot: !role.managed && role.id !== guild.id && role.position < me.roles.highest.position,
      }));
      res.json(roles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Legacy members (cache)
  app.get('/api/guilds/:guildId/members', async (req, res) => {
    try {
      const { guildId } = req.params;
      const customGroupsEnabled = await isFeatureEnabled(guildId, 'custom_groups');
      const guild = await client.guilds.fetch(guildId);
      await guild.members.fetch();

      const [accounts] = await fivemDb.query(
        "SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
      );

      const discordToInfo = new Map();
      const accountIdToInfo = new Map();
      for (const r of accounts) {
        const info = { accountid: String(r.accountid), groups: [] };
        discordToInfo.set(String(r.discord), info);
        accountIdToInfo.set(String(r.accountid), info);
      }

      if (customGroupsEnabled) {
        const [extGroups] = await fivemDb.query('SELECT accountid, `group` FROM accounts_groups');
        for (const g of extGroups) {
          const info = accountIdToInfo.get(String(g.accountid));
          if (info) info.groups.push(g.group);
        }
      }

      const members = (await guild.members.fetch()).map((m) => {
        const info = discordToInfo.get(m.id) || { accountid: null, groups: [] };
        const base = {
          guildId: guild.id,
          discordUserId: m.id,
          username: m.user.username,
          avatar: m.user.avatar ?? null,
          roleIds: Array.from(m.roles.cache.keys()),
          accountid: info.accountid,
        };
        return customGroupsEnabled ? { ...base, groups: info.groups } : base;
      });

      res.json(members);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // REST helpers
  async function fetchAllMembersREST(guildId, perPage = 1000, hardCap = 20000) {
    let after = '0';
    const all = [];
    for (;;) {
      const batch = await rest.get(Routes.guildMembers(guildId), { query: { limit: Math.min(perPage, 1000), after } });
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      after = String(batch[batch.length - 1].user.id);
      if
    }
    return all;
  }

  async function fetchAllMembersGateway(client, guildId) {
    const guild = await client.guilds.fetch(guildId);
    const col = await guild.members.fetch(); // requires Server Members intent
    return Array.from(col.values()).map((m) => ({
      user: { id: m.user.id, username: m.user.username, global_name: m.user.globalName },
      roles: Array.from(m.roles.cache.keys()),
    }));
  }

  // Smart fetch with better fallback + forceable source
  async function fetchAllMembersSmart(client, guildId, expectedTotal, forceSource = 'auto') {
    const dbg = { forceSource };
    try {
      if (forceSource === 'gateway') {
        const gAll = await fetchAllMembersGateway(client, guildId);
        return { members: gAll, source: 'gateway', ...dbg };
      }
      if (forceSource === 'rest') {
        const rAll = await fetchAllMembersREST(guildId);
        return { members: rAll, source: 'rest', ...dbg };
      }

      // auto: try REST first
      const rAll = await fetchAllMembersREST(guildId);
      const rCount = rAll.length;
      dbg.restCount = rCount;

      const needGateway =
        (typeof expectedTotal === 'number' && expectedTotal > 0 && rCount < expectedTotal) ||
        rCount <= 1; // if REST only returns the bot or 1 user, try gateway

      if (!needGateway) return { members: rAll, source: 'rest', ...dbg };

      try {
        const gAll = await fetchAllMembersGateway(client, guildId);
        return { members: gAll, source: 'gateway', restCount: rCount, gatewayCount: gAll.length, ...dbg };
      } catch (e) {
        dbg.gatewayError = String(e?.message || e);
        return { members: rAll, source: 'rest', ...dbg };
      }
    } catch (e) {
      dbg.outerError = String(e?.message || e);
      return { members: [], source: 'error', ...dbg };
    }
  }

  // Paged members, supports all=true and source override
  app.get('/api/guilds/:guildId/members-paged', async (req, res) => {
    try {
      const { guildId } = req.params;
      const rawLimit = Math.max(1, Math.min(Number(req.query.limit) || 100, 1000));
      const after = (req.query.after && String(req.query.after)) || '0';
      const q = req.query.q ? String(req.query.q) : '';
      const role = req.query.role ? String(req.query.role) : '';
      const group = req.query.group ? String(req.query.group) : '';
      const wantAll = String(req.query.all || '').toLowerCase() === 'true';
      const debug = String(req.query.debug || '').toLowerCase() === '1';
      const sourceOverride = (String(req.query.source || 'auto').toLowerCase());

      const premium = await isFeatureEnabled(guildId, 'custom_groups');
      const g = await client.guilds.fetch(guildId);
      const total = g?.memberCount ?? null;

      let rawMembers = [];
      let nextAfter = null;
      let dbg = {};

      if (wantAll || (typeof total === 'number' && total <= 1000)) {
        const smart = await fetchAllMembersSmart(client, guildId, total ?? undefined, sourceOverride);
        rawMembers = smart.members;
        dbg = { source: smart.source, ...smart };
      } else {
        const page = await rest.get(Routes.guildMembers(guildId), { query: { limit: rawLimit, after } });
        rawMembers = page;
        nextAfter = page.length ? String(page[page.length - 1].user.id) : null;
        dbg = { source: 'rest_page', pageSize: page.length };
      }

      const ids = rawMembers.map((m) => String(m.user?.id)).filter(Boolean);

      let accountByDiscord = new Map();
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const [accRows] = await fivemDb.query(
          `SELECT accountid, REPLACE(discord, 'discord:', '') AS discord
           FROM accounts
           WHERE discord IS NOT NULL AND REPLACE(discord, 'discord:', '') IN (${ph})`,
          ids
        );
        accountByDiscord = new Map(accRows.map((r) => [String(r.discord), String(r.accountid)]));
      }

      let groupsByAccount = new Map();
      if (premium && accountByDiscord.size) {
        const accIds = Array.from(new Set(Array.from(accountByDiscord.values())));
        if (accIds.length) {
          const accPH = accIds.map(() => '?').join(',');
          const [grpRows] = await fivemDb.query(
            `SELECT accountid, \`group\` FROM accounts_groups WHERE accountid IN (${accPH})`,
            accIds
          );
          for (const r of grpRows) {
            const k = String(r.accountid);
            if (!groupsByAccount.has(k)) groupsByAccount.set(k, []);
            groupsByAccount.get(k).push(r.group);
          }
        }
      }

      let members = rawMembers.map((m) => {
        const discordId = String(m.user?.id);
        const accountid = accountByDiscord.get(discordId) || null;
        const base = {
          guildId,
          discordUserId: discordId,
          username: m.user?.username || m.user?.global_name || discordId,
          roleIds: Array.isArray(m.roles) ? m.roles.map(String) : [],
          accountid,
        };
        return premium ? { ...base, groups: accountid ? groupsByAccount.get(accountid) || [] : [] } : base;
      });

      if (q) {
        const qLower = q.toLowerCase();
        members = members.filter(
          (m) =>
            (m.username || '').toLowerCase().includes(qLower) ||
            String(m.discordUserId || '').includes(qLower) ||
            String(m.accountid || '').includes(qLower)
        );
      }
      if (role) {
        const roleIds = role.split(',');
        members = members.filter((m) => roleIds.some((r) => m.roleIds.includes(r)));
      }
      if (premium && group) {
        const groups = group.split(',');
        members = members.filter((m) => Array.isArray(m.groups) && m.groups.some((gp) => groups.includes(gp)));
      }

      const payload = {
        guildId,
        page: { limit: wantAll ? Math.min(members.length || rawLimit, 1000) : rawLimit, after, nextAfter, total },
        members,
      };
      if (debug) payload._debug = { returned: members.length, expectedTotal: total, ...dbg };

      res.json(payload);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/guilds/:guildId/members-search', async (req, res) => {
    try {
      const { guildId } = req.params;
      const q = String(req.query.q || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      if (!q) return res.json([]);
      const list = await rest.get(Routes.guildMembersSearch(guildId), { query: { query: q, limit } });
      const members = list.map((m) => ({
        guildId,
        discordUserId: String(m.user?.id),
        username: m.user?.username || m.user?.global_name || String(m.user?.id),
        roleIds: Array.isArray(m.roles) ? m.roles.map(String) : [],
        accountid: null,
      }));
      res.json(members);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/guilds/:guildId/members/:userId/roles/:roleId', requireRoleManager(client), async (req, res) => {
    try {
      const { guildId, userId, roleId } = req.params;
      const guild = await client.guilds.fetch(guildId);
      await guild.roles.fetch();
      const role = guild.roles.cache.get(roleId);
      if (!role) return res.status(404).json({ error: 'role_not_found' });
      const member = await guild.members.fetch(userId);
      const me = await guild.members.fetchMe();
      if (role.managed || role.id === guild.id) return res.status(400).json({ error: 'uneditable_role' });
      if (role.position >= me.roles.highest.position) return res.status(400).json({ error: 'role_above_bot' });
      await member.roles.add(role);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.code || err.message });
    }
  });

  app.delete('/api/guilds/:guildId/members/:userId/roles/:roleId', requireRoleManager(client), async (req, res) => {
    try {
      const { guildId, userId, roleId } = req.params;
      const guild = await client.guilds.fetch(guildId);
      await guild.roles.fetch();
      const role = guild.roles.cache.get(roleId);
      if (!role) return res.status(404).json({ error: 'role_not_found' });
      const member = await guild.members.fetch(userId);
      const me = await guild.members.fetchMe();
      if (role.managed || role.id === guild.id) return res.status(400).json({ error: 'uneditable_role' });
      if (role.position >= me.roles.highest.position) return res.status(400).json({ error: 'role_above_bot' });
      await member.roles.remove(role);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.code || err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server listening on ${PORT}`);
  });
};
