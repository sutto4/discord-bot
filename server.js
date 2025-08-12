const express = require('express');
const { fivemDb } = require('./config/database');

module.exports = function startServer(client) {
	const app = express();
	const PORT = process.env.PORT || 3001;

	// CORS (safe since you proxy via same origin now, but harmless)
	app.use((req, res, next) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		next();
	});

	// List guilds with fields the UI expects
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
			res.status(500).json({ error: err.message });
		}
	});

	// Members for a guild with optional filters
	app.get('/api/guilds/:guildId/members', async (req, res) => {
		try {
			const { q, role, group } = req.query;
			const guild = await client.guilds.fetch(req.params.guildId);
			await guild.members.fetch();

			const [accounts] = await fivemDb.query(
				"SELECT accountid, REPLACE(discord, 'discord:', '') AS discord FROM accounts WHERE discord IS NOT NULL"
			);
			const accountMap = new Map();
			accounts.forEach(r => accountMap.set(r.discord, { accountid: String(r.accountid), groups: [] }));

			const [extGroups] = await fivemDb.query('SELECT accountid, `group` FROM accounts_groups');
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
					m.username.toLowerCase().includes(qLower) || m.discordUserId.includes(qLower)
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
	app.get('/api/external/groups', async (_req, res) => {
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

	app.listen(PORT, '0.0.0.0', () => {
		console.log(`API server listening on port ${PORT}`);
	});
};
