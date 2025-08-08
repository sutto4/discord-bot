const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/prefixes.json');
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function loadMap() {
	try {
		if (!fs.existsSync(configPath)) return {};
		const raw = fs.readFileSync(configPath, 'utf8');
		return JSON.parse(raw || '{}') || {};
	} catch {
		return {};
	}
}

function saveMap(map) {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, JSON.stringify(map, null, 2));
}

function isValidPrefix(prefix) {
	// 1–5 visible, non-whitespace characters. Examples: ., !, ?, $, >>
	return typeof prefix === 'string' && /^[^\s]{1,5}$/.test(prefix);
}

async function getGuildPrefix(guildId) {
	const now = Date.now();
	const cacheKey = guildId || 'global';
	const cached = cache.get(cacheKey);
	if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

	const map = loadMap();
	let value = map[guildId];

	if (!value && guildId) {
		// First time seeing this guild, set default prefix
		value = '.';
		map[guildId] = value;
		saveMap(map);
	}

	if (!value) return null;

	cache.set(cacheKey, { value, at: now });
	return value;
}

async function setGuildPrefix(guildId, prefix) {
	if (!guildId) throw new Error('guildId required');
	if (!isValidPrefix(prefix)) throw new Error('Invalid prefix');
	const map = loadMap();
	map[guildId] = prefix;
	saveMap(map);
	cache.set(guildId, { value: prefix, at: Date.now() });
	return prefix;
}

module.exports = {
	getGuildPrefix,
	setGuildPrefix,
	isValidPrefix
};
