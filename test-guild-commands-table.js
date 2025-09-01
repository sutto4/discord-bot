const mysql = require('mysql2/promise');
require('dotenv').config();

async function testGuildCommandsTable() {
  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('Connected to database');

    // Check if guild_commands table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'guild_commands'
    `, [process.env.DB_NAME]);

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
