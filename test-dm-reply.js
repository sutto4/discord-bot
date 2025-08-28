// Test script for DM reply functionality
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDmReply() {
    let connection;

    try {
        // Connect to database using environment variables
        connection = await mysql.createConnection({
            host: process.env.BOT_DB_HOST || 'localhost',
            user: process.env.BOT_DB_USER || 'root',
            password: process.env.BOT_DB_PASSWORD || '',
            database: process.env.BOT_DB_NAME || 'chester_bot'
        });

        console.log('✅ Connected to database');

        // Check if table exists
        const [tables] = await connection.execute(
            "SHOW TABLES LIKE 'dm_reply_settings'"
        );

        if (tables.length === 0) {
            console.log('❌ dm_reply_settings table does not exist');
            console.log('📋 Please run this SQL to create the table:');
            console.log(`
CREATE TABLE IF NOT EXISTS dm_reply_settings (
    guild_id VARCHAR(20) PRIMARY KEY,
    channel_id VARCHAR(20) NULL,
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_guild_id (guild_id),
    INDEX idx_enabled (enabled)
);
            `);
            return;
        }

        console.log('✅ dm_reply_settings table exists');

        // Check table structure
        const [columns] = await connection.execute(
            "DESCRIBE dm_reply_settings"
        );

        console.log('✅ Table structure:', columns.map(col => col.Field));

        // Test inserting a record
        const testGuildId = '123456789012345678';
        await connection.execute(
            'INSERT INTO dm_reply_settings (guild_id, channel_id, enabled) VALUES (?, NULL, FALSE) ON DUPLICATE KEY UPDATE guild_id = guild_id',
            [testGuildId]
        );

        console.log('✅ Test record inserted successfully');

        // Test fetching the record
        const [rows] = await connection.execute(
            'SELECT * FROM dm_reply_settings WHERE guild_id = ?',
            [testGuildId]
        );

        console.log('✅ Test record fetched:', rows[0]);

        // Clean up test record
        await connection.execute(
            'DELETE FROM dm_reply_settings WHERE guild_id = ?',
            [testGuildId]
        );

        console.log('✅ Test record cleaned up');

        // Check for any existing settings
        const [allSettings] = await connection.execute(
            'SELECT guild_id, channel_id, enabled FROM dm_reply_settings WHERE enabled = TRUE'
        );

        console.log('📊 Current enabled settings:', allSettings);

        console.log('\n🎉 All DM reply system tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check your .env file has correct database credentials');
        console.log('2. Ensure the dm_reply_settings table exists');
        console.log('3. Make sure the bot has DirectMessages intent enabled');
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

testDmReply();
