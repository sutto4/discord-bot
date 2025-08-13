// api/services/membersWithGroups.js
const { isFeatureEnabled } = require('../lib/features');

/**
 * Replace this function's SELECT with your real members source if needed.
 * It must return:
 *   discord_id (string), discord_username (string), accountid (number|null), roles_json (JSON string or null)
 */
async function fetchBaseMembers(db, guildId) {
	const [rows] = await db.query(
		`SELECT m.discord_id,
		        m.discord_username,
		        m.accountid,
		        m.roles_json
		   FROM guild_members_view m
		  WHERE m.guild_id = ?`,
		[guildId]
	);
	return rows.map(r => ({
		discord_id: r.discord_id,
		discord_username: r.discord_username,
		accountid: r.accountid,
		roles: r.roles_json ? JSON.parse(r.roles_json) : [],
		avatar: null // Not available from DB, placeholder for API consistency
	}));
}

async function attachGroupsIfEnabled(db, guildId, members) {
	const enabled = await isFeatureEnabled(db, guildId, 'custom_groups');
	if (!enabled) return { members, customGroupsEnabled: false };

	const ids = Array.from(new Set(members.map(m => m.accountid).filter(Boolean)));
	if (ids.length === 0) return { members, customGroupsEnabled: true };

	const placeholders = ids.map(() => '?').join(',');
	const [groupRows] = await db.query(
		`SELECT accountid, group_name
		   FROM account_groups
		  WHERE accountid IN (${placeholders})`,
		ids
	);

	const byAccount = new Map();
	for (const r of groupRows) {
		const a = Number(r.accountid);
		if (!byAccount.has(a)) byAccount.set(a, []);
		byAccount.get(a).push(r.group_name);
	}

	for (const m of members) {
		if (m.accountid && byAccount.has(m.accountid)) {
			m.groups = byAccount.get(m.accountid);
		}
	}
	return { members, customGroupsEnabled: true };
}

async function getMembersAugmented(db, guildId) {
	const base = await fetchBaseMembers(db, guildId);
	const { members, customGroupsEnabled } = await attachGroupsIfEnabled(db, guildId, base);
	return { guildId, members, features: { custom_groups: customGroupsEnabled } };
}

module.exports = { getMembersAugmented };
