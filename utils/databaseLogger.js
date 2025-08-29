/**
 * Logs a moderation action to the database
 * @param {Object} data - The moderation action data
 * @param {string} data.guildId - The guild ID
 * @param {string} data.caseId - The case ID
 * @param {string} data.actionType - The action type (ban, kick, mute, etc.)
 * @param {string} data.targetUserId - The target user ID
 * @param {string} data.targetUsername - The target username
 * @param {string} data.moderatorUserId - The moderator user ID
 * @param {string} data.moderatorUsername - The moderator username
 * @param {string} data.reason - The reason for the action
 * @param {number|null} data.durationMs - Duration in milliseconds (for timeouts/mutes)
 * @param {string|null} data.durationLabel - Human-readable duration label
 * @param {boolean} data.active - Whether the action is currently active
 * @param {Date|null} data.expiresAt - When the action expires (if applicable)
 */
async function logModerationAction(data) {
	const { appDb } = require('../config/database');

	try {
		// Insert into moderation_cases
		await connection.execute(
			`INSERT INTO moderation_cases (
				guild_id, case_id, action_type, target_user_id, target_username,
				moderator_user_id, moderator_username, reason, duration_ms, duration_label,
				active, expires_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
			[
				data.guildId,
				data.caseId,
				data.actionType,
				data.targetUserId,
				data.targetUsername,
				data.moderatorUserId,
				data.moderatorUsername,
				data.reason || null,
				data.durationMs || null,
				data.durationLabel || null,
				data.active,
				data.expiresAt || null
			]
		);

		// Also log to moderation_logs for backwards compatibility
		await connection.execute(
			`INSERT INTO moderation_logs (guild_id, case_id, action, user_id, username, details, created_at)
			VALUES (?, ?, ?, ?, ?, ?, NOW())`,
			[
				data.guildId,
				data.caseId,
				data.actionType,
				data.targetUserId,
				data.targetUsername,
				JSON.stringify(data)
			]
		);

		console.log('✅ Moderation action saved to database:', {
			guildId: data.guildId,
			caseId: data.caseId,
			actionType: data.actionType,
			targetUserId: data.targetUserId,
			targetUsername: data.targetUsername,
			moderatorUserId: data.moderatorUserId,
			moderatorUsername: data.moderatorUsername,
			reason: data.reason,
			duration: data.durationMs
		});
	} catch (dbError) {
		console.error('❌ Failed to save moderation action to database:', dbError);
		// Don't throw error - we don't want to break the command if DB logging fails
	} finally {
		await connection.end();
	}
}

module.exports = { logModerationAction };
