module.exports = {
	name: 'messageReactionAdd',
	execute: async (reaction, user, client) => {
		try {
			if (user.bot) return;
			if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
			const message = reaction.message;
			if (!message || message.partial) { try { await message.fetch(); } catch { return; } }
			const guild = message.guild; if (!guild) return;

			const { appDb } = require('../config/database');
			const guildId = guild.id;
			const messageId = message.id;
			const emojiId = reaction.emoji.id;
			const emojiName = reaction.emoji.name;

			const [rows] = await appDb.execute(
				`SELECT id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
				[guildId, messageId]
			);
			const msg = Array.isArray(rows) && rows[0]; if (!msg) return;

			const [maps] = await appDb.execute(
				`SELECT role_id FROM reaction_role_mappings
				 WHERE reaction_role_message_id = ?
				   AND (
				     (emoji_id IS NOT NULL AND emoji_id = ?) OR
				     (emoji_id IS NULL AND emoji = ?)
				   )
				 LIMIT 1`,
				[msg.id, emojiId || null, emojiName || null]
			);
			const map = Array.isArray(maps) && maps[0]; if (!map) return;

			const member = await guild.members.fetch(user.id).catch(() => null);
			if (!member) return;
			// Check if bot can assign this role before proceeding
			const role = guild.roles.cache.get(String(map.role_id));
			if (!role) {
				console.error(`[REACTION-ROLES] Role ${map.role_id} not found in guild ${guild.name}`);
				return;
			}

			if (!role.editable) {
				console.error(`[REACTION-ROLES] Cannot assign role ${role.name} - role is not editable by bot in guild ${guild.name}`);
				return;
			}

			console.log(`[REACTION-ROLES] Assigning role ${role.name} to user ${user.tag} in guild ${guild.name} via reaction`);
			await member.roles.add(String(map.role_id), 'Reaction role add').catch((error) => {
				console.error(`[REACTION-ROLES] Failed to assign role ${role.name} to user ${user.tag}:`, error);
			});
		} catch {}
	}
};
