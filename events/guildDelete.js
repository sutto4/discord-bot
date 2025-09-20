const { GuildDatabase } = require('../config/database-multi-guild');
const { postSystemEvent } = require('../utils/systemEvents');

module.exports = {
	name: 'guildDelete',
	async execute(guild, client) {
		console.log(`[GUILD_DELETE] Bot left guild: ${guild.name} (${guild.id})`);
		
		try {
			// Get database connection
			const { appDb } = require('../config/database');
			
			// Update guild status to 'inactive' instead of removing (soft delete)
			await appDb.query(
				'UPDATE guilds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
				['inactive', guild.id]
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
			
			// Clean up Discord commands when server leaves
			if (client.commandManager) {
				try {
					await client.commandManager.updateGuildCommands(guild.id, []); // Empty array = remove all commands
					console.log(`[GUILD_DELETE] Removed all commands from ${guild.name}`);
				} catch (cmdError) {
					console.error(`[GUILD_DELETE] Error removing commands from ${guild.name}:`, cmdError);
				}
			}

			// Clean up other guild-specific tables as needed
			// You can add more cleanup queries here for other features
			
			// Log the guild leave for monitoring
			console.log(`[GUILD_DELETE] Soft delete completed for guild:`, {
				name: guild.name,
				id: guild.id,
				memberCount: guild.memberCount,
				leftAt: new Date().toISOString(),
				action: 'Status updated to "inactive", features cleaned up'
			});

			// System event: guild removed (fire-and-forget)
			postSystemEvent('/system-events/guild-removed', {
				guildId: guild.id,
				guildName: guild.name,
				actorId: guild.ownerId,
				actorName: undefined,
			});
			
		} catch (error) {
			console.error(`[GUILD_DELETE] Error handling guild leave for ${guild.name}:`, error);
			
			// Try to at least update the status even if cleanup fails
			try {
				const { appDb } = require('../config/database');
				await appDb.query(
					'UPDATE guilds SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
					['inactive', guild.id]
				);
				console.log(`[GUILD_DELETE] Status updated to "inactive" for guild ${guild.id} despite cleanup errors`);
			} catch (statusError) {
				console.error(`[GUILD_DELETE] Failed to update status for guild ${guild.id}:`, statusError);
			}
		}
	},
};
