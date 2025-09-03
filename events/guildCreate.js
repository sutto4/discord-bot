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

			// Mark server as newly added for sound notification
			if (botInviterId) {
				try {
					// Store notification flag in database for web app sound
					await appDb.query(
						"INSERT INTO user_notifications (user_id, type, message, data, created_at) VALUES (?, 'new_server', ?, ?, NOW()) ON DUPLICATE KEY UPDATE created_at = NOW()",
						[botInviterId, `ServerMate added to ${guild.name}!`, JSON.stringify({ guildId: guild.id, guildName: guild.name, timestamp: new Date().toISOString() })]
					);
					console.log(`[GUILD_CREATE] Stored new server notification for user ${botInviterId}`);
				} catch (dbError) {
					console.warn(`[GUILD_CREATE] Could not store notification:`, dbError.message);
				}
			}

			// Send welcome DM to bot inviter
			if (botInviterId) {
				try {
					const inviter = await client.users.fetch(botInviterId);
					const welcomeEmbed = {
						color: 0x00ff00,
						title: '🎉 Welcome to ServerMate!',
						description: `**🚧 BETA RELEASE** - This is a beta version subject to testing and ongoing development.\n\nThank you for adding ServerMate to **${guild.name}**! I'm excited to help you manage your server more efficiently.`,
						fields: [
							{
								name: '🚀 Getting Started',
								value: '• Visit the [web dashboard](https://app.servermate.gg) to configure your server\n• Check out our [documentation](https://docs.servermate.gg) for detailed guides\n• Join our [support Discord](https://discord.gg/servermate) for help and updates',
								inline: false
							},
							{
								name: '⚙️ Quick Setup',
								value: '• Configure moderation commands in your server settings\n• Set up verification system if needed\n• Customize bot permissions and roles',
								inline: false
							},
							{
								name: '💎 Premium Features',
								value: 'Upgrade to premium for advanced features like:\n• Custom commands\n• Advanced analytics\n• Priority support\n• And much more!',
								inline: false
							}
						],
						footer: {
							text: 'ServerMate - Making Discord server management easier'
						},
						timestamp: new Date().toISOString()
					};

					await inviter.send({ embeds: [welcomeEmbed] });
					console.log(`[GUILD_CREATE] Sent welcome DM to bot inviter ${botInviterId}`);
				} catch (dmError) {
					console.log(`[GUILD_CREATE] Could not send welcome DM to bot inviter:`, dmError.message);
				}
			}

			// Send welcome DM to server owner (if different from inviter)
			if (guild.ownerId && guild.ownerId !== botInviterId) {
				try {
					const owner = await client.users.fetch(guild.ownerId);
					const ownerWelcomeEmbed = {
						color: 0x00ff00,
						title: '🎉 ServerMate Added to Your Server!',
						description: `**🚧 BETA RELEASE** - This is a beta version subject to testing and ongoing development.\n\nServerMate has been added to **${guild.name}**! As the server owner, you have full access to all features.`,
						fields: [
							{
								name: '🔧 Next Steps',
								value: '• Visit the [web dashboard](https://app.servermate.gg) to configure your server\n• Set up moderation commands and permissions\n• Configure verification system if needed',
								inline: false
							},
							{
								name: '📚 Resources',
								value: '• [Documentation](https://docs.servermate.gg)\n• [Support Discord](https://discord.gg/servermate)\n• [Feature Guide](https://docs.servermate.gg/features)',
								inline: false
							}
						],
						footer: {
							text: 'ServerMate - Making Discord server management easier'
						},
						timestamp: new Date().toISOString()
					};

					await owner.send({ embeds: [ownerWelcomeEmbed] });
					console.log(`[GUILD_CREATE] Sent welcome DM to server owner ${guild.ownerId}`);
				} catch (dmError) {
					console.log(`[GUILD_CREATE] Could not send welcome DM to server owner:`, dmError.message);
				}
			}

		} catch (error) {
			console.error(`[GUILD_CREATE] Error handling guild join for ${guild.name}:`, error);
		}
	},
};
