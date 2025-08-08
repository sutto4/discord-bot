const fs = require('fs');
const path = require('path');

const premiumPath = path.join(__dirname, '../data/premium_guilds.json');
let cached = null;
let cachedAt = 0;
const TTL = 60 * 1000;

function loadPremiumSet() {
	const now = Date.now();
	if (cached && now - cachedAt < TTL) return cached;

	let set = new Set();
	try {
		if (fs.existsSync(premiumPath)) {
			const raw = fs.readFileSync(premiumPath, 'utf8');
			const arr = JSON.parse(raw || '[]');
			if (Array.isArray(arr)) set = new Set(arr.map(String));
		}
	} catch {}
	// Also support env var (comma-separated)
	const envList = (process.env.PREM_GUILDS || '').split(',').map(s => s.trim()).filter(Boolean);
	for (const id of envList) set.add(id);

	cached = set;
	cachedAt = now;
	return set;
}

function isGuildPremium(guildId) {
	if (!guildId) return false;
	const set = loadPremiumSet();
	return set.has(String(guildId));
}

module.exports = { isGuildPremium };
