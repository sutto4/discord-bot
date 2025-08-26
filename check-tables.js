const { appDb } = require('./config/database');

async function checkTables() {
  try {
    console.log('🔍 Checking database tables...');
    
    // Check if embedded_message_channels table exists
    const [tables] = await appDb.query("SHOW TABLES LIKE 'embedded_message_channels'");
    
    if (tables.length > 0) {
      console.log('✅ embedded_message_channels table already exists');
      
      // Check the structure
      const [columns] = await appDb.query("DESCRIBE embedded_message_channels");
      console.log('📋 Table structure:');
      columns.forEach(col => {
        console.log(`  ${col.Field} - ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
    } else {
      console.log('❌ embedded_message_channels table does not exist');
    }
    
    // Check embedded_messages table structure
    const [embeddedColumns] = await appDb.query("DESCRIBE embedded_messages");
    console.log('\n📋 embedded_messages table structure:');
    embeddedColumns.forEach(col => {
      console.log(`  ${col.Field} - ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking tables:', error);
  } finally {
    process.exit(0);
  }
}

checkTables();
