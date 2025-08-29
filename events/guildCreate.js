const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	name: 'guildCreate',
	async execute(guild, client) {
		console.log(`[GUILD_CREATE] Bot joined new guild: ${guild.name} (${guild.id})`);
		
		try {
			// Immediately add the guild to the database
			await GuildDatabase.initializeGuild(guild.id, guild.name);

			// Try to get the bot inviter from audit logs
			let botInviterId = null;
			try {
				const auditLogs = await guild.fetchAuditLogs({
					type: 28, // BOT_ADD
					limit: 1
				});

				const botAddEntry = auditLogs.entries.first();
				if (botAddEntry && botAddEntry.target.id === client.user.id) {
					botInviterId = botAddEntry.executor.id;
					console.log(`[GUILD_CREATE] Bot inviter found: ${botAddEntry.executor.username} (${botInviterId})`);
				}
			} catch (auditError) {
				console.log(`[GUILD_CREATE] Could not fetch audit logs for inviter:`, auditError.message);
			}

			// Grant access to bot inviter if found
			if (botInviterId) {
				try {
					const { appDb } = require('../config/database');
					await appDb.query(
						'INSERT INTO server_access_control (guild_id, user_id, has_access, granted_by, notes) VALUES (?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE has_access = 1, granted_at = CURRENT_TIMESTAMP',
						[guild.id, botInviterId, 'SYSTEM', 'Bot inviter - automatic access']
					);
					console.log(`[GUILD_CREATE] Granted access to bot inviter ${botInviterId}`);
				} catch (dbError) {
					console.error(`[GUILD_CREATE] Error granting access to bot inviter:`, dbError);
				}
			}

			// Also grant access to server owner
			try {
				const { appDb } = require('../config/database');
				await appDb.query(
					'INSERT INTO server_access_control (guild_id, user_id, has_access, granted_by, notes) VALUES (?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE has_access = 1, granted_at = CURRENT_TIMESTAMP',
					[guild.id, guild.ownerId, 'SYSTEM', 'Server owner - automatic access']
				);
				console.log(`[GUILD_CREATE] Granted access to server owner ${guild.ownerId}`);
			} catch (dbError) {
				console.error(`[GUILD_CREATE] Error granting access to server owner:`, dbError);
			}

			// Log the guild join for monitoring
			console.log(`[GUILD_CREATE] Guild details:`, {
				name: guild.name,
				id: guild.id,
				memberCount: guild.memberCount,
				ownerId: guild.ownerId,
				botInviterId: botInviterId,
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
