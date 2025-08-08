const { fivemDb, botDb } = require('../config/database');
const { donatorRoleMapping } = require('../config/roles');
const { applyDonatorRole } = require('../helpers/applyDonatorRole');
const { GuildDatabase } = require('../config/database-multi-guild');

async function syncDonators(client) {
	console.log('[SYNC] Starting donator sync process');
	try {
		// Get guilds with FDG donator sync enabled
		const enabledGuilds = await GuildDatabase.getGuildsWithFeature('fdg_donator_sync');
		if (enabledGuilds.length === 0) {
			console.log('[SYNC] No guilds have FDG donator sync enabled - skipping sync');
			return;
		}

		console.log(`[SYNC] Running FDG donator sync for ${enabledGuilds.length} enabled guild(s)`);
		
		console.log('[SYNC] Querying database for active donator accounts...');
		const [rows] = await fivemDb.query(`
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

		// Process each enabled guild
		for (const guildConfig of enabledGuilds) {
			const guild = client.guilds.cache.get(guildConfig.guild_id);
			if (!guild) {
				console.log(`[SYNC] Guild ${guildConfig.guild_name} not found in bot cache - skipping`);
				continue;
			}

			console.log(`[SYNC] Processing guild: ${guild.name} (${guild.id})`);
			
			// Fetch all guild members at once (much faster than individual fetches)
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
						await applyDonatorRole(member, fivemDb, donatorRoleMapping);
					}
					processed++;
					
					if (processed % 50 === 0) { // Reduced frequency since it's much faster now
						console.log(`[SYNC] ${guild.name}: Processed ${processed}/${rows.length} accounts (${found} found in server)`);
					}
				} catch (memberError) {
					console.error(`[SYNC] Error processing member ${discordId} in ${guild.name}:`, memberError);
				}
			}
			
			console.log(`[SYNC] ${guild.name}: Sync completed - Processed: ${processed}, Found in server: ${found}`);
		}
		
		console.log('[SYNC] Overall sync process completed');
	} catch (err) {
		console.error('[SYNC] Error during donator sync:', err);
		throw err; // Re-throw to allow command to handle the error
	}
}

module.exports = syncDonators;