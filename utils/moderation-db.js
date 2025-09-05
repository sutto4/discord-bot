const mysql = require('mysql2/promise');

// Use the same database configuration as the rest of the bot
const dbConfig = {
	host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
	user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
	password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
	database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
	port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306),
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
};

class ModerationDatabase {
	constructor() {
		this.pool = mysql.createPool(dbConfig);
	}

	async logModerationAction(data) {
		const connection = await this.pool.getConnection();
		try {
			const {
				guildId,
				caseId,
				actionType,
				targetUserId,
				targetUsername,
				moderatorUserId,
				moderatorUsername,
				reason,
				durationMs,
				durationLabel,
				active,
				expiresAt
			} = data;

			// Insert into moderation_cases table
			console.log('Executing SQL query for moderation case...');
			try {
				const [result] = await connection.execute(`
					INSERT INTO moderation_cases (
						guild_id, case_id, action_type, target_user_id, target_username,
						moderator_user_id, moderator_username, reason, duration_ms,
						duration_label, active, expires_at, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
				`, [
					guildId, caseId, actionType, targetUserId, targetUsername,
					moderatorUserId, moderatorUsername, reason, durationMs,
					durationLabel, active ? 1 : 0, expiresAt
				]);

				const caseId_db = result.insertId;
				console.log('Moderation case inserted successfully, ID:', caseId_db);
			} catch (sqlError) {
				console.error('SQL Error inserting moderation case:', {
					message: sqlError.message,
					code: sqlError.code,
					sqlState: sqlError.sqlState,
					sql: sqlError.sql
				});
				throw sqlError;
			}

			// Log the action in moderation_logs table
			try {
				await connection.execute(`
					INSERT INTO moderation_logs (
						guild_id, case_id, action, user_id, username, details, created_at
					) VALUES (?, ?, ?, ?, ?, ?, NOW())
				`, [
					guildId, caseId_db, actionType, moderatorUserId, moderatorUsername,
					JSON.stringify({
						targetUserId,
						targetUsername,
						reason,
						durationMs,
						durationLabel,
						active,
						expiresAt
					})
				]);
				console.log('Moderation log inserted successfully');
			} catch (logError) {
				console.error('SQL Error inserting moderation log:', {
					message: logError.message,
					code: logError.code,
					sqlState: logError.sqlState
				});
				// Don't throw here - the main case was inserted successfully
			}

			return caseId_db;
		} finally {
			connection.release();
		}
	}

	async getCaseDetails(guildId, caseId) {
		const connection = await this.pool.getConnection();
		try {
			const [rows] = await connection.execute(`
				SELECT * FROM moderation_cases 
				WHERE guild_id = ? AND case_id = ?
				LIMIT 1
			`, [guildId, caseId]);

			return rows.length > 0 ? rows[0] : null;
		} finally {
			connection.release();
		}
	}

	async getCasesByGuild(guildId, limit = 50, offset = 0) {
		const connection = await this.pool.getConnection();
		try {
			const [rows] = await connection.execute(`
				SELECT * FROM moderation_cases 
				WHERE guild_id = ?
				ORDER BY created_at DESC
				LIMIT ? OFFSET ?
			`, [guildId, limit, offset]);

			return rows;
		} finally {
			connection.release();
		}
	}

	async getCasesByUser(guildId, userId, limit = 50) {
		const connection = await this.pool.getConnection();
		try {
			const [rows] = await connection.execute(`
				SELECT * FROM moderation_cases 
				WHERE guild_id = ? AND target_user_id = ?
				ORDER BY created_at DESC
				LIMIT ?
			`, [guildId, userId, limit]);

			return rows;
		} finally {
			connection.release();
		}
	}

	async updateCaseStatus(caseId, active, expiresAt = null) {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(`
				UPDATE moderation_cases 
				SET active = ?, expires_at = ?, updated_at = NOW()
				WHERE id = ?
			`, [active ? 1 : 0, expiresAt, caseId]);

			return true;
		} finally {
			connection.release();
		}
	}

	async addEvidence(caseId, guildId, evidenceType, content, uploadedBy) {
		const connection = await this.pool.getConnection();
		try {
			const [result] = await connection.execute(`
				INSERT INTO moderation_evidence (
					case_id, guild_id, evidence_type, content, uploaded_by, uploaded_at
				) VALUES (?, ?, ?, ?, ?, NOW())
			`, [caseId, guildId, evidenceType, content, uploadedBy]);

			return result.insertId;
		} finally {
			connection.release();
		}
	}

	async getEvidenceByCase(caseId) {
		const connection = await this.pool.getConnection();
		try {
			const [rows] = await connection.execute(`
				SELECT * FROM moderation_evidence 
				WHERE case_id = ?
				ORDER BY uploaded_at ASC
			`, [caseId]);

			return rows;
		} finally {
			connection.release();
		}
	}

	async getModerationStats(guildId) {
		const connection = await this.pool.getConnection();
		try {
			// Get total cases
			const [totalResult] = await connection.execute(`
				SELECT COUNT(*) as total FROM moderation_cases WHERE guild_id = ?
			`, [guildId]);

			// Get active cases
			const [activeResult] = await connection.execute(`
				SELECT COUNT(*) as active FROM moderation_cases 
				WHERE guild_id = ? AND active = 1
			`, [guildId]);

			// Get cases by type
			const [typeResult] = await connection.execute(`
				SELECT action_type, COUNT(*) as count 
				FROM moderation_cases 
				WHERE guild_id = ?
				GROUP BY action_type
			`, [guildId]);

			return {
				total: totalResult[0].total,
				active: activeResult[0].active,
				byType: typeResult.reduce((acc, row) => {
					acc[row.action_type] = row.count;
					return acc;
				}, {})
			};
		} finally {
			connection.release();
		}
	}

	async setCommandStatus(guildId, command, enabled) {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(`
				INSERT INTO slash_command_permissions (guild_id, command_name, enabled, updated_at)
				VALUES (?, ?, ?, NOW())
				ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = NOW()
			`, [guildId, command, enabled ? 1 : 0]);

			return true;
		} finally {
			connection.release();
		}
	}

	async getCommandStatus(guildId, command) {
		const connection = await this.pool.getConnection();
		try {
			const [rows] = await connection.execute(`
				SELECT enabled FROM slash_command_permissions 
				WHERE guild_id = ? AND command_name = ?
				LIMIT 1
			`, [guildId, command]);

			// If no specific setting, default to enabled
			return rows.length > 0 ? rows[0].enabled === 1 : true;
		} finally {
			connection.release();
		}
	}

	async resetAllCommands(guildId) {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(`
				DELETE FROM slash_command_permissions WHERE guild_id = ?
			`, [guildId]);

			return true;
		} finally {
			connection.release();
		}
	}
}

module.exports = ModerationDatabase;

