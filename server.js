// server.js
const express = require('express');
const { REST, Routes } = require('discord.js');
const { fivemDb, appDb } = require('./config/database');

async function isFeatureEnabled(guildId, featureName) {
  const [rows] = await appDb.query(
    `SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_name = ? LIMIT 1`,
    [guildId, featureName]
  );
  if (!rows || rows.length === 0) return false;
  return String(rows[0].enabled) === '1';
}

module.exports = function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3001;

  // REST client for Discord pagination
  const rest = client?.rest ?? new REST({ version: '10' }).setToken(process.env.TOKEN);

  // CORS
  app.use((_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // Health
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Features endpoint — expose both flags
  app.get('/api/guilds/:guildId/features', async (req, res) => {
    try {
      const { guildId } = req.params;
      const customGroups = await isFeatureEnabled(guildId, 'custom_groups');
      // premium_members == custom_groups for now
      const premiumMembers = customGroups;
      res.json({
        guildId,
        features: {
          custom_groups: customGroups,
          premium_members: premiumMembers
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Guilds
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

  // Roles
  app.get('/api/guilds/:guildId/roles', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.roles.fetch();
      const roles = guild.roles.cache.map(role => ({
        guildId: guild.id,
        roleId: role.id,
        name: role.name,
        color: role.hexColor || null,
      }));
      res.json(roles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Legacy full-members (kept) — unchanged logic, but uses feature flag for groups
  app.get('/api/guilds/:guildId/members', async (req, res) => {
    try {
      const { guildId } = req.params;
      const { q, role, group } = req.query;

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

      let members = guild.members.cache.map(m => {
        const info = discordToInfo.get(m.id) || { accountid: null, groups: [] };
        const base = {
          guildId: guild.id,
          discordUserId: m.id,
          username: m.user.username,
          roleIds: Array.from(m.roles.cache.keys()),
          accountid: info.accountid
        };
        return customGroupsEnabled ? { ...base, groups: info.groups } : base;
      });

      if (q) {
        const qLower = String(q).toLowerCase();
        members = members.filter(m =>
          (m.username || '').toLowerCase().includes(qLower) ||
          String(m.discordUserId || '').includes(qLower) ||
          String(m.accountid || '').includes(qLower)
        );
      }
      if (role) {
        const roleIds = String(role).split(',');
        members = members.filter(m => roleIds.some(r => m.roleIds.includes(r)));
      }
      if (customGroupsEnabled && group) {
        const groups = String(group).split(',');
        members = members.filter(m => Array.isArray(m.groups) && m.groups.some(g => groups.includes(g)));
      }

      res.json(members);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Paged members — premium gating
  app.get('/api/guilds/:guildId/members-paged', async (req, res) => {
    try {
      const { guildId } = req.params;
      const rawLimit = Math.max(1, Math.min(Number(req.query.limit) || 100, 1000));
      const after = (req.query.after && String(req.query.after)) || '0';
      const q = req.query.q ? String(req.query.q) : '';
      const role = req.query.role ? String(req.query.role) : '';
      const group = req.query.group ? String(req.query.group) : '';

      const premium = await isFeatureEnabled(guildId, 'custom_groups');

      // Limits
      const limit = premium ? Math.min(rawLimit, 500) : Math.min(rawLimit, 100);

      // Page from Discord REST
      const page = await rest.get(Routes.guildMembers(guildId), { query: { limit, after } });

      // IDs in this page
      const ids = page.map(m => String(m.user?.id)).filter(Boolean);

      // Map discord -> accountid
      let accountByDiscord = new Map();
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const [accRows] = await fivemDb.query(
          `SELECT accountid, REPLACE(discord, 'discord:', '') AS discord
           FROM accounts
           WHERE discord IS NOT NULL AND REPLACE(discord, 'discord:', '') IN (${ph})`,
          ids
        );
        accountByDiscord = new Map(accRows.map(r => [String(r.discord), String(r.accountid)]));
      }

      // Groups per accountid only if premium
      let groupsByAccount = new Map();
      if (premium && accountByDiscord.size) {
        const accIds = Array.from(new Set(Array.from(accountByDiscord.values())));
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

      // Build records
      let members = page.map(m => {
        const discordId = String(m.user?.id);
        const accountid = accountByDiscord.get(discordId) || null;
        const base = {
          guildId,
          discordUserId: discordId,
          username: m.user?.username || m.user?.global_name || discordId,
          roleIds: Array.isArray(m.roles) ? m.roles.map(String) : [],
          accountid
        };
        return premium ? { ...base, groups: accountid ? (groupsByAccount.get(accountid) || []) : [] } : base;
      });

      // Server-side filters
      if (q) {
        const qLower = q.toLowerCase();
        members = members.filter(m =>
          (m.username || '').toLowerCase().includes(qLower) ||
          String(m.discordUserId || '').includes(qLower) ||
          String(m.accountid || '').includes(qLower)
        );
      }
      if (role) {
        const roleIds = role.split(',');
        members = members.filter(m => roleIds.some(r => m.roleIds.includes(r)));
      }
      if (premium && group) {
        const groups = group.split(',');
        members = members.filter(m => Array.isArray(m.groups) && m.groups.some(g => groups.includes(g)));
      }

      const nextAfter = page.length ? String(page[page.length - 1].user.id) : null;
      const g = await client.guilds.fetch(guildId);
      const total = g?.memberCount ?? null;

      res.json({
        guildId,
        page: { limit, after, nextAfter, total },
        members
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // External groups passthrough
  app.get('/api/external/groups', async (_req, res) => {
    try {
      const [rows] = await fivemDb.query(
        'SELECT accountid, `group`, assigned_on, assigned_by FROM accounts_groups'
      );
      const groups = rows.map(r => ({
        accountid: String(r.accountid),
        group: r.group,
        assigned_on: r.assigned_on,
        assigned_by: String(r.assigned_by),
      }));
      res.json(groups);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server listening on ${PORT}`);
  });
};
