const mysql = require('mysql2/promise');
require('dotenv').config();

async function testGuildCommandsTable() {
  let connection;
  
  try {
    // Debug environment variables
    console.log('Environment variables:');
    console.log('APP_DB_HOST:', process.env.APP_DB_HOST);
    console.log('BOT_DB_HOST:', process.env.BOT_DB_HOST);
    console.log('APP_DB_USER:', process.env.APP_DB_USER);
    console.log('BOT_DB_USER:', process.env.BOT_DB_USER);
    console.log('APP_DB_PASSWORD:', process.env.APP_DB_PASSWORD ? '[SET]' : '[NOT SET]');
    console.log('BOT_DB_PASSWORD:', process.env.BOT_DB_PASSWORD ? '[SET]' : '[NOT SET]');
    console.log('APP_DB_NAME:', process.env.APP_DB_NAME);
    console.log('BOT_DB_NAME:', process.env.BOT_DB_NAME);
    
    // Connect to database using the same config as the bot
    const dbConfig = {
      host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
      user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
      password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
      database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
      port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306),
    };
    
    console.log('Database config:', {
      ...dbConfig,
      password: dbConfig.password ? '[SET]' : '[NOT SET]'
    });
    
    connection = await mysql.createConnection(dbConfig);

    console.log('Connected to database');

    // Check if guild_commands table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guild_commands'
    `, [process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot']);

    if (tables.length === 0) {
      console.log('guild_commands table does not exist. Creating it...');
      
      // Create the table
      await connection.execute(`
        CREATE TABLE guild_commands (
          id int(11) NOT NULL AUTO_INCREMENT,
          guild_id varchar(255) NOT NULL,
          command_name varchar(255) NOT NULL,
          enabled tinyint(1) NOT NULL DEFAULT 1,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY guild_command (guild_id, command_name),
          KEY guild_id (guild_id),
          KEY command_name (command_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('Created guild_commands table');
    } else {
      console.log('guild_commands table exists');
    }

    // Test inserting a command
    const testGuildId = '123456789';
    const testCommand = 'warn';
    
    console.log(`Testing insert/update for guild ${testGuildId}, command ${testCommand}`);
    
    const result = await connection.execute(
      `INSERT INTO guild_commands (guild_id, command_name, enabled)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = CURRENT_TIMESTAMP`,
      [testGuildId, testCommand, 1]
    );
    
    console.log('Insert/update result:', result);

    // Check if the record was inserted/updated
    const [records] = await connection.execute(
      'SELECT * FROM guild_commands WHERE guild_id = ? AND command_name = ?',
      [testGuildId, testCommand]
    );
    
    console.log('Retrieved record:', records);

    // Clean up test record
    await connection.execute(
      'DELETE FROM guild_commands WHERE guild_id = ? AND command_name = ?',
      [testGuildId, testCommand]
    );
    
    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Error testing guild_commands table:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the test
testGuildCommandsTable();
