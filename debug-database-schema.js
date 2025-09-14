const mysql = require('mysql2/promise');

async function debugDatabaseSchema() {
  const connection = await mysql.createConnection({
    host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
    user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
    password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
    database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
    port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306)
  });

  try {
    console.log('🔍 Debugging database schema...\n');

    // 1. Check guilds table structure
    console.log('--- Guilds Table Structure ---');
    const [guildsColumns] = await connection.execute('DESCRIBE guilds');
    guildsColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'} ${col.Key ? `(${col.Key})` : ''}`);
    });

    // 2. Check for triggers on guilds table
    console.log('\n--- Triggers on Guilds Table ---');
    const [triggers] = await connection.execute(`
      SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_STATEMENT 
      FROM information_schema.TRIGGERS 
      WHERE EVENT_OBJECT_TABLE = 'guilds'
    `);
    
    if (triggers.length > 0) {
      triggers.forEach(trigger => {
        console.log(`Trigger: ${trigger.TRIGGER_NAME}`);
        console.log(`Event: ${trigger.EVENT_MANIPULATION}`);
        console.log(`Statement: ${trigger.ACTION_STATEMENT}`);
        console.log('---');
      });
    } else {
      console.log('No triggers found on guilds table');
    }

    // 3. Check if feature_name column exists anywhere
    console.log('\n--- Checking for feature_name column ---');
    const [featureNameCheck] = await connection.execute(`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE COLUMN_NAME = 'feature_name' 
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    if (featureNameCheck.length > 0) {
      console.log('Tables with feature_name column:');
      featureNameCheck.forEach(row => {
        console.log(`  ${row.TABLE_NAME}.${row.COLUMN_NAME}`);
      });
    } else {
      console.log('No feature_name column found in any table');
    }

    // 4. Test the exact query that's failing
    console.log('\n--- Testing the failing query ---');
    try {
      const testQuery = `
        INSERT INTO guilds (guild_id, guild_name, status) 
        VALUES (?, ?, 'active') 
        ON DUPLICATE KEY UPDATE 
            guild_name = VALUES(guild_name),
            status = 'active',
            updated_at = CURRENT_TIMESTAMP
      `;
      
      // Use a test guild ID that won't conflict
      const testGuildId = '999999999999999999';
      await connection.execute(testQuery, [testGuildId, 'Test Guild']);
      console.log('✅ Test query executed successfully');
      
      // Clean up test data
      await connection.execute('DELETE FROM guilds WHERE guild_id = ?', [testGuildId]);
      console.log('✅ Test data cleaned up');
      
    } catch (error) {
      console.log('❌ Test query failed:', error.message);
      console.log('Error code:', error.code);
    }

  } catch (error) {
    console.error('Error during debugging:', error);
  } finally {
    await connection.end();
  }
}

debugDatabaseSchema();
