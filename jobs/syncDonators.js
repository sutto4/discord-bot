const { fivemDb, botDb } = require('../config/database');
const { donatorRoleMapping } = require('../config/roles');
const { applyDonatorRole } = require('../helpers/applyDonatorRole');
const { GuildDatabase } = require('../config/database-multi-guild');

async function syncDonators(client) {
	console.log('[SYNC] Starting donator sync process');
	const syncStartTime = Date.now();
	
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
		const memberCache = require('../utils/memberCache');
		
		for (const guildConfig of enabledGuilds) {
			const guild = client.guilds.cache.get(guildConfig.guild_id);
			if (!guild) {
				console.log(`[SYNC] Guild ${guildConfig.guild_name} not found in bot cache - skipping`);
				continue;
			}

			console.log(`[SYNC] Processing guild: ${guild.name} (${guild.id})`);
			
			// RATE LIMIT FIX: Use cache to avoid hitting rate limits across multiple guilds
			let cachedData = memberCache.get(guild.id);
			
			if (!cachedData) {
				console.log('[SYNC] Cache miss - fetching guild members (chunked)...');
				// Fetch members in chunks to respect rate limits
				const options = { limit: 1000 };
				await guild.members.fetch(options);
				
				// Store in cache
				const membersArray = Array.from(guild.members.cache.values());
				memberCache.set(guild.id, membersArray, false);
				
				console.log(`[SYNC] Cached ${membersArray.length} members for ${guild.name}`);
			} else {
				console.log(`[SYNC] Using cached members (${cachedData.members.size} members) for ${guild.name}`);
			}
			
			console.log(`[SYNC] Guild has ${guild.members.cache.size} members available`);

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
			
			// Log this guild's sync to database
			await GuildDatabase.logDonatorSync(
				guild.id, 
				processed, 
				found, 
				Date.now() - syncStartTime, 
				true, 
				null
			);
		}
		
		console.log('[SYNC] Overall sync process completed');
		
		// Log overall sync completion
		const totalSyncTime = Date.now() - syncStartTime;
		console.log(`[SYNC] Total sync time: ${totalSyncTime}ms`);
		
	} catch (err) {
		console.error('[SYNC] Error during donator sync:', err);
		
		// Log sync failure to database if we can identify which guild
		try {
			await GuildDatabase.logSyncAttempt(
				'global', 
				0, 
				false, 
				err.message
			);
		} catch (logError) {
			console.error('[SYNC] Failed to log sync error:', logError);
		}
		
		throw err; // Re-throw to allow command to handle the error
	}
}

module.exports = syncDonators;