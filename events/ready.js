const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	name: 'ready',
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);
		
		// Initialize all guilds in database
		console.log('Initializing guilds in database...');
		for (const guild of client.guilds.cache.values()) {
			await GuildDatabase.initializeGuild(guild.id, guild.name);
			console.log(`✅ Initialized guild: ${guild.name} (${guild.id})`);
		}
		console.log(`Database initialized for ${client.guilds.cache.size} guilds`);
	},
};