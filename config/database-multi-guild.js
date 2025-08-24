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
            INSERT INTO guilds (guild_id, guild_name, status) 
            VALUES (?, ?, 'active') 
            ON DUPLICATE KEY UPDATE 
                guild_name = VALUES(guild_name),
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
        `;
        
        try {
            await pool.execute(query, [guildId, guildName]);
            console.log(`Guild ${guildName} (${guildId}) initialized in database with active status`);
        } catch (error) {
            console.error('Error initializing guild:', error);
        }
    }

    // Remove guild from database
    static async removeGuild(guildId) {
        const query = 'DELETE FROM guilds WHERE guild_id = ?';
        
        try {
            const [result] = await pool.execute(query, [guildId]);
            if (result.affectedRows > 0) {
                console.log(`Guild ${guildId} removed from database`);
            } else {
                console.log(`Guild ${guildId} was not found in database`);
            }
        } catch (error) {
            console.error('Error removing guild:', error);
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
            donators: 'SELECT COUNT(*) as count FROM donator_syncs WHERE guild_id = ?',
            sync_operations: 'SELECT COUNT(*) as count FROM sync_operations WHERE guild_id = ? AND operation_type = "donator_sync"'
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
            return { verifications: 0, feedback: 0, donators: 0, sync_operations: 0 };
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

    // Check if guild has a specific feature enabled
    static async hasFeature(guildId, featureName) {
        const query = 'SELECT enabled FROM guild_features WHERE guild_id = ? AND feature_name = ?';
        
        try {
            const [rows] = await pool.execute(query, [guildId, featureName]);
            return rows.length > 0 && rows[0].enabled === 1;
        } catch (error) {
            console.error('Error checking guild feature:', error);
            return false;
        }
    }

    // Enable/disable a feature for a guild
    static async setFeature(guildId, featureName, enabled) {
        const query = `
            INSERT INTO guild_features (guild_id, feature_name, enabled) 
            VALUES (?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                enabled = VALUES(enabled),
                updated_at = CURRENT_TIMESTAMP
        `;
        
        try {
            await pool.execute(query, [guildId, featureName, enabled]);
            console.log(`Guild ${guildId} feature '${featureName}' ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('Error setting guild feature:', error);
        }
    }

    // Get guilds with a specific feature enabled
    static async getGuildsWithFeature(featureName) {
        const query = `
            SELECT g.guild_id, g.guild_name 
            FROM guilds g
            INNER JOIN guild_features gf ON g.guild_id = gf.guild_id
            WHERE gf.feature_name = ? AND gf.enabled = 1
        `;
        
        try {
            const [rows] = await pool.execute(query, [featureName]);
            return rows;
        } catch (error) {
            console.error('Error getting guilds with feature:', error);
            return [];
        }
    }

    // Get all features for a specific guild
    static async getGuildFeatures(guildId) {
        const query = 'SELECT feature_name, enabled FROM guild_features WHERE guild_id = ?';
        
        try {
            const [rows] = await pool.execute(query, [guildId]);
            const features = {};
            rows.forEach(row => {
                features[row.feature_name] = row.enabled === 1;
            });
            return features;
        } catch (error) {
            console.error('Error getting guild features:', error);
            return {};
        }
    }

    // Set guild package (enables all features in that package)
    static async setGuildPackage(guildId, packageName) {
        try {
            // Get features for this package level
            const query = `
                SELECT feature_key FROM features 
                WHERE is_active = 1 AND (
                    minimum_package = 'free' OR
                    (minimum_package = 'premium' AND ? = 'premium')
                )
            `;
            
            const [features] = await pool.execute(query, [packageName]);
            
            // First, disable all features for this guild
            await pool.execute('DELETE FROM guild_features WHERE guild_id = ?', [guildId]);
            
            // Then enable features for the selected package
            if (features.length > 0) {
                const values = features.map(feature => [guildId, feature.feature_key, 1]);
                const placeholders = values.map(() => '(?, ?, ?)').join(', ');
                const flatValues = values.flat();
                
                await pool.execute(
                    `INSERT INTO guild_features (guild_id, feature_name, enabled) VALUES ${placeholders}`,
                    flatValues
                );
            }
            
            const featureNames = features.map(f => f.feature_key).join(', ');
            console.log(`Guild ${guildId} set to ${packageName} package with features: ${featureNames}`);
            return true;
        } catch (error) {
            console.error('Error setting guild package:', error);
            return false;
        }
    }

    // Get guild's current package
    static async getGuildPackage(guildId) {
        try {
            const features = await this.getGuildFeatures(guildId);
            const enabledFeatures = Object.keys(features).filter(key => features[key]);
            
            // Check what package this guild should have based on enabled features
            const packages = ['premium', 'free'];
            
            for (const packageName of packages) {
                const query = `
                    SELECT feature_key FROM features 
                    WHERE is_active = 1 AND (
                        minimum_package = 'free' OR
                        (minimum_package = 'premium' AND ? = 'premium')
                    )
                `;
                
                const [packageFeatures] = await pool.execute(query, [packageName]);
                const packageFeatureKeys = packageFeatures.map(f => f.feature_key);
                
                // Check if enabled features match this package
                if (packageFeatureKeys.length === enabledFeatures.length && 
                    packageFeatureKeys.every(feature => enabledFeatures.includes(feature))) {
                    return packageName;
                }
            }
            
            return 'custom'; // If features don't match any standard package
        } catch (error) {
            console.error('Error getting guild package:', error);
            return 'free';
        }
    }

    // Get available packages and their features from database
    static async getAvailablePackages() {
        try {
            const packages = {
                'free': { name: 'Free', price: '$0/month', features: [] },
                'premium': { name: 'Premium', price: '$15/month', features: [] }
            };

            // Get features for each package
            for (const packageName of Object.keys(packages)) {
                const query = `
                    SELECT feature_key, feature_name FROM features 
                    WHERE is_active = 1 AND (
                        minimum_package = 'free' OR
                        (minimum_package = 'premium' AND ? = 'premium')
                    )
                `;
                
                const [features] = await pool.execute(query, [packageName]);
                packages[packageName].features = features.map(f => ({
                    key: f.feature_key,
                    name: f.feature_name
                }));
            }

            return packages;
        } catch (error) {
            console.error('Error getting available packages:', error);
            return {
                'free': { name: 'Free', price: '$0/month', features: [] }
            };
        }
    }

    // Get all available features
    static async getAllFeatures() {
        try {
            const [features] = await pool.execute(
                'SELECT * FROM features WHERE is_active = 1 ORDER BY minimum_package, feature_name'
            );
            return features;
        } catch (error) {
            console.error('Error getting all features:', error);
            return [];
        }
    }

    // Update feature configuration
    static async updateFeature(featureKey, updates) {
        try {
            const fields = [];
            const values = [];
            
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            
            values.push(featureKey);
            
            await pool.execute(
                `UPDATE features SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE feature_key = ?`,
                values
            );
            
            console.log(`Feature ${featureKey} updated`);
            return true;
        } catch (error) {
            console.error('Error updating feature:', error);
            return false;
        }
    }

    // Log donator sync for a specific guild
    static async logDonatorSync(guildId, accountsProcessed, accountsFound, duration, success, errorMessage) {
        const query = `
            INSERT INTO sync_operations 
            (guild_id, operation_type, accounts_processed, accounts_found, duration_ms, success, error_message) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        try {
            await pool.execute(query, [guildId, 'donator_sync', accountsProcessed, accountsFound, duration, success, errorMessage]);
        } catch (error) {
            console.error('Error logging donator sync:', error);
        }
    }

    // Log general sync attempt
    static async logSyncAttempt(source, guildsProcessed, success, errorMessage) {
        const query = `
            INSERT INTO sync_operations 
            (operation_type, accounts_processed, success, error_message) 
            VALUES (?, ?, ?, ?)
        `;
        
        try {
            await pool.execute(query, [source, guildsProcessed, success, errorMessage]);
        } catch (error) {
            console.error('Error logging sync attempt:', error);
        }
    }

    // Update guild premium status
    static async updateGuildPremiumStatus(guildId, isPremium, planType, subscriptionId) {
        try {
            // Update the guild's premium status
            const updateQuery = `
                UPDATE guilds 
                SET is_premium = ?, 
                    premium_plan = ?, 
                    subscription_id = ?,
                    premium_updated_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE guild_id = ?
            `;
            
            await pool.execute(updateQuery, [isPremium ? 1 : 0, planType, subscriptionId, guildId]);
            
            // Log the premium status change
            const logQuery = `
                INSERT INTO guild_premium_logs 
                (guild_id, action, plan_type, subscription_id, timestamp) 
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            await pool.execute(logQuery, [guildId, 'premium_enabled', planType, subscriptionId]);
            
            console.log(`Guild ${guildId} premium status updated: ${isPremium ? 'enabled' : 'disabled'} (${planType})`);
            return true;
        } catch (error) {
            console.error('Error updating guild premium status:', error);
            return false;
        }
    }
}

module.exports = { pool, GuildDatabase };
