// server.js
const express = require("express");
const { fivemDb, botDb } = require("./config/database");

/**
 * Start the HTTP API that the Next.js app calls.
 * Expects a connected Discord.js v14 client with GUILD_MEMBERS intent.
 */
module.exports = function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(express.json());

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
      const [rows] = await botDb.query(
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

  // Guilds list
  app.get("/api/guilds", async (_req, res) => {
    try {
      const guilds = await Promise.all(
        client.guilds.cache.map(async (g) => {
          const guild = await client.guilds.fetch(g.id);
          await guild.roles.fetch();
          const iconUrl = guild.iconURL
            ? guild.iconURL({ size: 128, extension: "png" })
            : null;
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
      console.error("guilds error", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Roles for a guild
  app.get("/api/guilds/:guildId/roles", async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      await guild.roles.fetch();
      const me = guild.members.me;
      const roles = guild.roles.cache.map((role) => ({
        guildId: guild.id,
        roleId: role.id,
        name: role.name,
        color: role.hexColor || null,
        managed: role.managed,
        editableByBot:
          typeof role.editable === "boolean"
            ? role.editable
            : me
            ? role.position < me.roles.highest.position
            : false,
      }));
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
      // --- DEBUG LOGGING ---
      const avatarUrl = toAvatarUrl(m.user, 64);
      console.log({
        userId: m.id,
        username: m.user?.username,
        avatarUrl,
        userObj: m.user
      });
      // --- END DEBUG LOGGING ---
      return {
        guildId: guild.id,
        discordUserId: m.id,
        username: m.user?.username ?? m.user?.globalName ?? "unknown",
        roleIds: Array.from(m.roles.cache.keys()),
        accountid,
        groups,
        avatarUrl,
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
          avatarUrl: toAvatarUrl(m.user, 64),
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
          avatarUrl: toAvatarUrl(m.user, 64),
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API server listening on port ${PORT}`);
  });
};
