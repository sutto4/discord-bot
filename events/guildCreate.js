const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	name: 'guildCreate',
	async execute(guild, client) {
		console.log(`[GUILD_CREATE] Bot joined new guild: ${guild.name} (${guild.id})`);
		
		try {
			// Immediately add the guild to the database
			await GuildDatabase.initializeGuild(guild.id, guild.name);
			
			// Log the guild join for monitoring
			console.log(`[GUILD_CREATE] Guild details:`, {
				name: guild.name,
				id: guild.id,
				memberCount: guild.memberCount,
				ownerId: guild.ownerId,
				joinedAt: new Date().toISOString()
			});
			
			// You can add additional logic here like:
			// - Setting up default configurations
			// - Sending welcome messages
			// - Initializing guild-specific data
			
		} catch (error) {
			console.error(`[GUILD_CREATE] Error handling guild join for ${guild.name}:`, error);
		}
	},
};
