const db = require('../config/database');
const { donatorRoleMapping } = require('../config/roles');
const applyDonatorRole = require('../helpers/applyDonatorRole');

async function syncDonators(client) {
	console.log('[SYNC] Starting donator sync process');
	try {
		console.log('[SYNC] Querying database for active donator accounts...');
		const [rows] = await db.query(`
			SELECT a.discord 
			FROM fivem_live.tebex_accounts ta
			JOIN fivem_live.accounts a ON a.accountid = ta.accountid
			WHERE a.discord IS NOT NULL 
			AND (
				(ta.t1_expiry IS NOT NULL AND ta.t1_expiry > NOW()) OR
				(ta.t2_expiry IS NOT NULL AND ta.t2_expiry > NOW()) OR
				(ta.t3_expiry IS NOT NULL AND ta.t3_expiry > NOW())
			)
		`);

		console.log(`[SYNC] Found ${rows.length} active donator accounts`);

		// Fetch all guild members at once (much faster than individual fetches)
		const guild = client.guilds.cache.first();
		console.log('[SYNC] Fetching all guild members...');
		await guild.members.fetch();
		console.log(`[SYNC] Guild has ${guild.members.cache.size} members cached`);

		let processed = 0;
		let found = 0;
		
		for (const row of rows) {
			const discordId = row.discord?.replace('discord:', '');
			if (!discordId) continue;

			try {
				// Use cached members instead of individual API calls
				const member = guild.members.cache.get(discordId);
				if (member) {
					found++;
					await applyDonatorRole(member, db, donatorRoleMapping);
				}
				processed++;
				
				if (processed % 50 === 0) { // Reduced frequency since it's much faster now
					console.log(`[SYNC] Processed ${processed}/${rows.length} accounts (${found} found in server)`);
				}
			} catch (memberError) {
				console.error(`[SYNC] Error processing member ${discordId}:`, memberError);
			}
		}
		
		console.log(`[SYNC] Sync completed - Processed: ${processed}, Found in server: ${found}`);
	} catch (err) {
		console.error('[SYNC] Error during donator sync:', err);
		throw err; // Re-throw to allow command to handle the error
	}
}

module.exports = syncDonators;