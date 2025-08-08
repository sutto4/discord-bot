const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/verify_log_channels.json');
const logChannelCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function loadVerifyLogMap() {
	// Safely read the JSON file; return {} if missing/invalid
	try {
		if (!fs.existsSync(configPath)) return {};
		const raw = fs.readFileSync(configPath, 'utf8');
		return JSON.parse(raw || '{}') || {};
	} catch {
		return {};
	}
}

async function getLogChannelId(guildId) {
	// cache check
	const now = Date.now();
	const cached = logChannelCache.get(guildId);
	if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
		return cached.value;
	}

	// Read from the same file set by /setverifylog
	const map = loadVerifyLogMap();
	const value = map[guildId] || null;

	logChannelCache.set(guildId, { value, fetchedAt: now });
	return value;
}

module.exports = {
	getLogChannelId
};