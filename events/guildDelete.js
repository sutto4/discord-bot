const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	name: 'guildDelete',
	async execute(guild, client) {
		console.log(`[GUILD_DELETE] Bot left guild: ${guild.name} (${guild.id})`);
		
		try {
			// Immediately remove the guild from the database
			await GuildDatabase.removeGuild(guild.id);
			
			// Log the guild leave for monitoring
			console.log(`[GUILD_DELETE] Guild details:`, {
				name: guild.name,
				id: guild.id,
				memberCount: guild.memberCount,
				leftAt: new Date().toISOString()
			});
			
			// You can add additional cleanup logic here like:
			// - Removing guild-specific data
			// - Cleaning up database records
			// - Notifying administrators
			
		} catch (error) {
			console.error(`[GUILD_DELETE] Error handling guild leave for ${guild.name}:`, error);
		}
	},
};
