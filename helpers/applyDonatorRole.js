const { logToChannel } = require('./logger');

module.exports = async function applyDonatorRole(member, db, donatorRoleMapping) {
	try {
		const [rows] = await db.query(
			`SELECT ta.t1_expiry, ta.t2_expiry, ta.t3_expiry
			 FROM fivem_live.tebex_accounts ta
			 JOIN fivem_live.accounts a ON a.accountid = ta.accountid
			 WHERE a.discord = ?`,
			[`discord:${member.id}`]
		);

		if (rows.length === 0) return;

		const { t1_expiry, t2_expiry, t3_expiry } = rows[0];
		const now = new Date();

		let highestTier = null;
		if (t3_expiry && new Date(t3_expiry) > now) highestTier = 'T3';
		else if (t2_expiry && new Date(t2_expiry) > now) highestTier = 'T2';
		else if (t1_expiry && new Date(t1_expiry) > now) highestTier = 'T1';

		let rolesChanged = false;
		let removedRoles = [];
		let addedRole = null;

		// Remove all donator roles except the current one
		for (const tier of ['T1', 'T2', 'T3']) {
			const roleName = donatorRoleMapping[tier];
			const role = member.guild.roles.cache.find(r => r.name === roleName);
			if (role && member.roles.cache.has(role.id) && tier !== highestTier) {
				await member.roles.remove(role).catch(() => {});
				removedRoles.push(roleName);
				rolesChanged = true;
			}
		}

		if (highestTier) {
			const roleName = donatorRoleMapping[highestTier];
			const role = member.guild.roles.cache.find(r => r.name === roleName);
			if (role && !member.roles.cache.has(role.id)) {
				await member.roles.add(role).catch(() => {});
				addedRole = roleName;
				rolesChanged = true;
				console.log(`Assigned ${roleName} to ${member.user.tag}`);
			}
		}

		// Log role changes to the verification log channel
		if (rolesChanged) {
			let logMessage = `**Role Sync** - <@${member.id}> (${member.user.tag})`;
			
			if (removedRoles.length > 0) {
				logMessage += `\nRemoved: ${removedRoles.join(', ')}`;
			}
			
			if (addedRole) {
				logMessage += `\nAdded: ${addedRole}`;
			}

			await logToChannel(member.guild, logMessage);
		}
	} catch (err) {
		console.error(`Error applying donator role to ${member.user?.tag || member.id}:`, err);
	}
};