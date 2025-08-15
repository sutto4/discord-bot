module.exports = {
	name: 'messageReactionRemove',
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
			await member.roles.remove(String(map.role_id), 'Reaction role remove').catch(() => {});
		} catch {}
	}
};
