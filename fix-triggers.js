const mysql = require('mysql2/promise');

async function fixTriggers() {
  const connection = await mysql.createConnection({
    host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
    user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
    password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
    database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
    port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306)
  });

  try {
    console.log('🔍 Finding triggers that reference feature_name...\n');

    // 1. Find all triggers that reference feature_name
    const [triggers] = await connection.execute(`
      SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, EVENT_MANIPULATION, ACTION_STATEMENT 
      FROM information_schema.TRIGGERS 
      WHERE ACTION_STATEMENT LIKE '%feature_name%'
      AND EVENT_OBJECT_SCHEMA = DATABASE()
    `);
    
    if (triggers.length === 0) {
      console.log('No triggers found that reference feature_name');
      return;
    }

    console.log(`Found ${triggers.length} trigger(s) that reference feature_name:`);
    triggers.forEach((trigger, index) => {
      console.log(`\n${index + 1}. Trigger: ${trigger.TRIGGER_NAME}`);
      console.log(`   Table: ${trigger.EVENT_OBJECT_TABLE}`);
      console.log(`   Event: ${trigger.EVENT_MANIPULATION}`);
      console.log(`   Statement: ${trigger.ACTION_STATEMENT}`);
    });

    // 2. Drop the problematic triggers
    console.log('\n🗑️ Dropping problematic triggers...');
    for (const trigger of triggers) {
      try {
        await connection.execute(`DROP TRIGGER IF EXISTS ${trigger.TRIGGER_NAME}`);
        console.log(`✅ Dropped trigger: ${trigger.TRIGGER_NAME}`);
      } catch (error) {
        console.log(`❌ Failed to drop trigger ${trigger.TRIGGER_NAME}:`, error.message);
      }
    }

    // 3. Test the guilds insert query again
    console.log('\n🧪 Testing guilds insert query...');
    try {
      const testQuery = `
        INSERT INTO guilds (guild_id, guild_name, status) 
        VALUES (?, ?, 'active') 
        ON DUPLICATE KEY UPDATE 
            guild_name = VALUES(guild_name),
            status = 'active',
            updated_at = CURRENT_TIMESTAMP
      `;
      
      const testGuildId = '999999999999999999';
      await connection.execute(testQuery, [testGuildId, 'Test Guild']);
      console.log('✅ Guilds insert query now works!');
      
      // Clean up test data
      await connection.execute('DELETE FROM guilds WHERE guild_id = ?', [testGuildId]);
      console.log('✅ Test data cleaned up');
      
    } catch (error) {
      console.log('❌ Guilds insert query still fails:', error.message);
    }

  } catch (error) {
    console.error('Error fixing triggers:', error);
  } finally {
    await connection.end();
  }
}

fixTriggers();
