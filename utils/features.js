let pool;
const cache = new Map(); // key: `${guildId}:${featureKey}` -> { value:boolean, at:number }
const TTL = 2 * 60 * 1000; // 2 minutes

function getPool() {
	try {
		// Prefer your existing DB module if available
		if (!pool) {
			const mod = require('../config/database');
			pool = mod?.pool || mod; // support both { pool } and direct pool export
		}
	} catch {
		pool = null;
	}
	return pool;
}

async function hasFeature(guildId, featureName) {
	if (!guildId || !featureName) return false;

	// cache hit
	const key = `${guildId}:${featureName}`;
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && now - hit.at < TTL) {
		console.log(`[FEATURES] Cache hit for ${key}: ${hit.value}`);
		return hit.value;
	}

	console.log(`[FEATURES] Cache miss for ${key}, querying database`);
	const db = getPool();
	if (!db?.execute) {
		console.log(`[FEATURES] No database connection available`);
		cache.set(key, { value: false, at: now });
		return false;
	}

	try {
		console.log(`[FEATURES] Querying guild_features for guild: ${guildId}, feature: ${featureName}`);
		const [rows] = await db.execute(
			'SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_key = ? LIMIT 1',
			[guildId, featureName]
		);
		console.log(`[FEATURES] Database result:`, rows);
		const value = !!rows?.[0]?.enabled;
		console.log(`[FEATURES] Feature enabled: ${value}`);
		cache.set(key, { value, at: now });
		return value;
	} catch (error) {
		console.error(`[FEATURES] Database error:`, error);
		cache.set(key, { value: false, at: now });
		return false;
	}
}

module.exports = { hasFeature };
