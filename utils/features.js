let pool;
const cache = new Map(); // key: `${guildId}:${featureKey}` -> { value:boolean, at:number }
const TTL = 2 * 60 * 1000; // 2 minutes

function getPool() {
	try {
		// Prefer your existing DB module if available
		if (!pool) {
			const mod = require('../config/database');
			pool = mod?.appDb || mod?.pool || mod; // support both { appDb } and direct pool export
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
		return hit.value;
	}

	const db = getPool();
	if (!db?.execute) {
		cache.set(key, { value: false, at: now });
		return false;
	}

	try {
		const [rows] = await db.execute(
			'SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_key = ? LIMIT 1',
			[guildId, featureName]
		);
		const value = !!rows?.[0]?.enabled;
		cache.set(key, { value, at: now });
		return value;
	} catch (error) {
		console.error(`[FEATURES] Database error:`, error);
		cache.set(key, { value: false, at: now });
		return false;
	}
}

module.exports = { hasFeature };
