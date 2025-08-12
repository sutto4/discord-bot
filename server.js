// server.js
const express = require('express');
const { fivemDb } = require('./config/database');

module.exports = function startServer(client) {
	const app = express();
	const PORT = process.env.PORT || 3001;

	app.use((req, res, next) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		next();
	});

	// ---- ROUTER mounted at "/" AND "/api" ----
	const router = express.Router();

	// List guilds (the one your UI calls)
	router.get('/guilds', async (_req, res) => {
		try {
			const list = await Promise.all(
				client.guilds.cache.map(async g => ({ id: g.id, name: g.name }))
			);
			res.json(list);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	// Fetch roles for a guild
	router.get('/guilds/:guildId/roles', async (req, res) => {
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
	router.get('/guilds/:guildId/members', async (req, res) => {
		try {
			const { q, role, group } = req.query;
			const guild = await client.guilds.fetch(req.params.guildId);
			await guild.members.fetch();

			const [accounts] = await fivemDb.query(
				"SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
			);
			const accountMap = new Map();
			accounts.forEach(r => accountMap.set(r.discord, { accountid: String(r.accountid), groups: [] }));

			const [extGroups] = await fivemDb.query(
				'SELECT accountid, `group` FROM accounts_groups'
			);
			extGroups.forEach(g => {
				const entry = accountMap.get(String(g.accountid));
				if (entry) entry.groups.push(g.group);
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
				const qLower = String(q).toLowerCase();
				members = members.filter(m =>
					m.username.toLowerCase().includes(qLower) ||
					m.discordUserId.includes(qLower)
				);
			}
			if (role) {
				const roleIds = String(role).split(',');
				members = members.filter(m => roleIds.some(r => m.roleIds.includes(r)));
			}
			if (group) {
				const groups = String(group).split(',');
				members = members.filter(m => m._groups.some(g => groups.includes(g)));
			}

			const result = members.map(({ _groups, ...rest }) => rest);
			res.json(result);
		} catch (err) {
			res.status(500).json({ error: err.message });
		}
	});

	// External groups
	router.get('/external/groups', async (_req, res) => {
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

	// Mount under BOTH "/" and "/api"
	app.use(['/', '/api'], router);

	app.listen(PORT, '0.0.0.0', () => {
		console.log(`API server listening on ${PORT}`);
	});
};
