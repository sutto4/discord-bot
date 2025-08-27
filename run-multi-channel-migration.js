const { appDb } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🚀 Running multi-channel embedded messages migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'setup-embedded-messages-multi-channel.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`📝 Executing: ${statement.substring(0, 50)}...`);
        await appDb.query(statement);
      }
    }
    
    console.log('✅ Multi-channel migration completed successfully!');
    console.log('📋 Created embedded_message_channels table');
    console.log('📋 Added multi_channel column to embedded_messages table');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();
