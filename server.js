const express = require('express');
const { fivemDb } = require('./config/database');

module.exports = function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // Fetch roles for a guild
  app.get('/guilds/:guildId/roles', async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch members for a guild with optional filtering
  app.get('/guilds/:guildId/members', async (req, res) => {
    try {
      const { q, role, group } = req.query;
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.members.fetch();

      // Map discord IDs to account IDs
      const [accounts] = await fivemDb.query(
        "SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
      );
      const accountMap = new Map();
      accounts.forEach(r => accountMap.set(r.discord, { accountid: String(r.accountid), groups: [] }));

      // Load external groups
      const [extGroups] = await fivemDb.query(
        'SELECT accountid, `group` FROM external_groups'
      );
      extGroups.forEach(g => {
        const entry = accountMap.get(String(g.accountid));
        if (entry) {
          entry.groups.push(g.group);
        }
      });

      let members = guild.members.cache.map(m => {
        const info = accountMap.get(m.id) || { accountid: null, groups: [] };
        return {
          guildId: guild.id,
          discordUserId: m.id,
          username: m.user.username,
          roleIds: Array.from(m.roles.cache.keys()),
          accountid: info.accountid,
          _groups: info.groups,
        };
      });

      if (q) {
        const qLower = q.toString().toLowerCase();
        members = members.filter(m =>
          m.username.toLowerCase().includes(qLower) ||
          m.discordUserId.includes(qLower)
        );
      }

      if (role) {
        const roleIds = role.toString().split(',');
        members = members.filter(m => roleIds.some(r => m.roleIds.includes(r)));
      }

      if (group) {
        const groups = group.toString().split(',');
        members = members.filter(m => m._groups.some(g => groups.includes(g)));
      }

      const result = members.map(({ _groups, ...rest }) => rest);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch external group assignments
  app.get('/external/groups', async (_req, res) => {
    try {
      const [rows] = await fivemDb.query(
        'SELECT accountid, `group`, assigned_on, assigned_by FROM external_groups'
      );
      const groups = rows.map(r => ({
        accountid: String(r.accountid),
        group: r.group,
        assigned_on: r.assigned_on,
        assigned_by: String(r.assigned_by),
      }));
      res.json(groups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
};
