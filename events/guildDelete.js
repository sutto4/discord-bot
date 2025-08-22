const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	name: 'guildDelete',
	async execute(guild, client) {
		console.log(`[GUILD_DELETE] Bot left guild: ${guild.name} (${guild.id})`);
		
		try {
			// Get database connection
			const { appDb } = require('../config/database');
			
			// Update guild status to 'left' instead of removing (soft delete)
			await appDb.query(
				'UPDATE guilds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
				['left', guild.id]
			);
			
			// Clean up guild-specific features (remove from guild_features table)
			await appDb.query(
				'DELETE FROM guild_features WHERE guild_id = ?',
				[guild.id]
			);
			
			// Clean up bot customization settings
			await appDb.query(
				'DELETE FROM bot_customization WHERE guild_id = ?',
				[guild.id]
			);
			
			// Clean up other guild-specific tables as needed
			// You can add more cleanup queries here for other features
			
			// Log the guild leave for monitoring
			console.log(`[GUILD_DELETE] Soft delete completed for guild:`, {
				name: guild.name,
				id: guild.id,
				memberCount: guild.memberCount,
				leftAt: new Date().toISOString(),
				action: 'Status updated to "left", features cleaned up'
			});
			
		} catch (error) {
			console.error(`[GUILD_DELETE] Error handling guild leave for ${guild.name}:`, error);
			
			// Try to at least update the status even if cleanup fails
			try {
				const { appDb } = require('../config/database');
				await appDb.query(
					'UPDATE guilds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
					['left', guild.id]
				);
				console.log(`[GUILD_DELETE] Status updated to "left" for guild ${guild.id} despite cleanup errors`);
			} catch (statusError) {
				console.error(`[GUILD_DELETE] Failed to update status for guild ${guild.id}:`, statusError);
			}
		}
	},
};
