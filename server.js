// server.js (root)
const express = require('express');
const { fivemDb, appDb } = require('./config/database');

async function isFeatureEnabled(guildId, featureName) {
	const [rows] = await appDb.query(
		`SELECT enabled
		   FROM guild_features
		  WHERE guild_id = ? AND feature_name = ?
		  LIMIT 1`,
		[guildId, featureName]
	);
	if (!rows || rows.length === 0) return false;
	return String(rows[0].enabled) === '1';
}

module.exports = function startServer(client) {
	const app = express();
	const PORT = process.env.PORT || 3001;

	// CORS
	app.use((_, res, next) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		next();
	});

	// Health
	app.get('/api/health', (_req, res) => res.json({ ok: true }));

	// Feature flag
	app.get('/api/guilds/:guildId/features', async (req, res) => {
		try {
			const { guildId } = req.params;
			const customGroups = await isFeatureEnabled(guildId, 'custom_groups');
			res.json({ guildId, features: { custom_groups: customGroups } });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: err.message });
		}
	});

	// Guilds list
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

	// Roles for a guild
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

	// Members with optional groups (feature-gated)
	app.get('/api/guilds/:guildId/members', async (req, res) => {
		try {
			const { guildId } = req.params;
			const { q, role, group } = req.query;

			const customGroupsEnabled = await isFeatureEnabled(guildId, 'custom_groups');

			const guild = await client.guilds.fetch(guildId);
			await guild.members.fetch();

			// accounts + groups live in FiveM DB
			const [accounts] = await fivemDb.query(
				"SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
			);

			const accountMap = new Map();
			accounts.forEach(r => accountMap.set(r.discord, { accountid: String(r.accountid), groups: [] }));

			if (customGroupsEnabled) {
				const [extGroups] = await fivemDb.query('SELECT accountid, `group` FROM accounts_groups');
				extGroups.forEach(g => {
					const entry = accountMap.get(String(g.accountid));
					if (entry) entry.groups.push(g.group);
				});
			}

			let members = guild.members.cache.map(m => {
				const info = accountMap.get(m.id) || { accountid: null, groups: [] };
				const base = {
					guildId: guild.id,
					discordUserId: m.id,
					username: m.user.username,
					roleIds: Array.from(m.roles.cache.keys()),
					accountid: info.accountid
				};
				return customGroupsEnabled ? { ...base, groups: info.groups } : base;
			});

			// q filter
			if (q) {
				const qLower = String(q).toLowerCase();
				members = members.filter(m =>
					(m.username || '').toLowerCase().includes(qLower) ||
					(String(m.discordUserId) || '').includes(qLower) ||
					(String(m.accountid || '')).includes(qLower)
				);
			}
			// role filter
			if (role) {
				const roleIds = String(role).split(',');
				members = members.filter(m => roleIds.some(r => m.roleIds.includes(r)));
			}
			// group filter only if enabled
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
