const mysql = require('mysql2/promise');
require('dotenv').config();

// Database connection configuration
const dbConfig = {
    host: process.env.BOT_DB_HOST || 'localhost',
    user: process.env.BOT_DB_USER || 'chester_bot',
    password: process.env.BOT_DB_PASSWORD,
    database: process.env.BOT_DB_NAME || 'chester_bot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Helper functions for multi-guild database operations

class GuildDatabase {
    
    // Initialize guild in database
    static async initializeGuild(guildId, guildName) {
        const query = `
            INSERT INTO guilds (guild_id, guild_name) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE 
                guild_name = VALUES(guild_name),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        try {
            await pool.execute(query, [guildId, guildName]);
            console.log(`Guild ${guildName} (${guildId}) initialized in database`);
        } catch (error) {
            console.error('Error initializing guild:', error);
        }
    }

    // Get guild configuration
    static async getGuildConfig(guildId) {
        const query = 'SELECT * FROM guilds WHERE guild_id = ?';
        
        try {
            const [rows] = await pool.execute(query, [guildId]);
            return rows[0] || null;
        } catch (error) {
            console.error('Error getting guild config:', error);
            return null;
        }
    }

    // Update guild configuration
    static async updateGuildConfig(guildId, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const query = `UPDATE guilds SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`;
        
        try {
            await pool.execute(query, [...values, guildId]);
            console.log(`Guild ${guildId} configuration updated`);
        } catch (error) {
            console.error('Error updating guild config:', error);
        }
    }

    // Log user verification
    static async logVerification(guildId, userId, username, success) {
        const query = `
            INSERT INTO user_verifications (guild_id, user_id, username, success) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                username = VALUES(username),
                verified_at = CURRENT_TIMESTAMP,
                success = VALUES(success)
        `;
        
        try {
            await pool.execute(query, [guildId, userId, username, success]);
        } catch (error) {
            console.error('Error logging verification:', error);
        }
    }

    // Log feedback submission
    static async logFeedback(guildId, userId, username, feedbackType, subject, details, contactInfo) {
        const query = `
            INSERT INTO feedback_submissions 
            (guild_id, user_id, username, feedback_type, subject, details, contact_info) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        try {
            await pool.execute(query, [guildId, userId, username, feedbackType, subject, details, contactInfo]);
        } catch (error) {
            console.error('Error logging feedback:', error);
        }
    }

    // Get guild stats
    static async getGuildStats(guildId) {
        const queries = {
            verifications: 'SELECT COUNT(*) as count FROM user_verifications WHERE guild_id = ? AND success = TRUE',
            feedback: 'SELECT COUNT(*) as count FROM feedback_submissions WHERE guild_id = ?',
            donators: 'SELECT COUNT(*) as count FROM donator_syncs WHERE guild_id = ?'
        };

        try {
            const results = {};
            
            for (const [key, query] of Object.entries(queries)) {
                const [rows] = await pool.execute(query, [guildId]);
                results[key] = rows[0].count;
            }
            
            return results;
        } catch (error) {
            console.error('Error getting guild stats:', error);
            return { verifications: 0, feedback: 0, donators: 0 };
        }
    }

    // Get all guilds
    static async getAllGuilds() {
        const query = 'SELECT guild_id, guild_name FROM guilds ORDER BY guild_name';
        
        try {
            const [rows] = await pool.execute(query);
            return rows;
        } catch (error) {
            console.error('Error getting all guilds:', error);
            return [];
        }
    }
}

module.exports = { pool, GuildDatabase };
