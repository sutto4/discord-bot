const { GuildDatabase } = require('../config/database-multi-guild');

const DEFAULT_PREFIX = '.';

async function getGuildPrefix(guildId) {
	if (!guildId) return DEFAULT_PREFIX;

	const config = await GuildDatabase.getGuildConfig(guildId);
	return config?.custom_prefix || DEFAULT_PREFIX;
}

async function setGuildPrefix(guildId, prefix) {
	if (!guildId) throw new Error('guildId required');
	if (!isValidPrefix(prefix)) throw new Error('Invalid prefix');

	await GuildDatabase.updateGuildConfig(guildId, { custom_prefix: prefix });
	return prefix;
}

function isValidPrefix(prefix) {
	return typeof prefix === 'string' && /^[^\s]{1,5}$/.test(prefix);
}

module.exports = {
	getGuildPrefix,
	setGuildPrefix,
	isValidPrefix
};
