const { appDb } = require('./config/database');

async function checkColumn() {
  try {
    console.log('🔍 Checking if discord_message_id column exists...');
    
    // Check if the column exists
    const [columns] = await appDb.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'embedded_message_channels' 
      AND COLUMN_NAME = 'discord_message_id'
    `);
    
    if (columns.length > 0) {
      console.log('✅ discord_message_id column exists!');
      
      // Check some sample data
      const [sampleData] = await appDb.query(`
        SELECT message_id, channel_id, discord_message_id 
        FROM embedded_message_channels 
        LIMIT 5
      `);
      
      console.log('📊 Sample data:');
      sampleData.forEach(row => {
        console.log(`  Message ${row.message_id}, Channel ${row.channel_id}: discord_message_id = ${row.discord_message_id || 'NULL'}`);
      });
      
    } else {
      console.log('❌ discord_message_id column does NOT exist!');
      console.log('💡 Run this migration:');
      console.log(`
ALTER TABLE embedded_message_channels 
ADD COLUMN discord_message_id VARCHAR(20) NULL AFTER channel_name;

CREATE INDEX idx_discord_message_id ON embedded_message_channels(discord_message_id);
      `);
    }
    
  } catch (error) {
    console.error('❌ Error checking column:', error);
  } finally {
    process.exit(0);
  }
}

checkColumn();
