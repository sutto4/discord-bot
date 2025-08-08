// Test MySQL connection for Discord Bot
const mysql = require('mysql2/promise');

async function testDatabase() {
    const dbConfig = {
        host: 'localhost',
        user: 'botuser',
        password: 'your_secure_password_here', // Change this!
        database: 'discord_bot'
    };

    try {
        console.log('🔄 Testing database connection...');
        
        // Create connection
        const connection = await mysql.createConnection(dbConfig);
        
        // Test basic query
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ Database connection successful!');
        
        // Test if tables exist
        const [tables] = await connection.execute('SHOW TABLES');
        console.log('📊 Tables found:', tables.length);
        tables.forEach(table => {
            console.log('  -', Object.values(table)[0]);
        });
        
        // Close connection
        await connection.end();
        
        console.log('🎉 Database setup is working correctly!');
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('\n🔧 Check:');
        console.log('- MySQL service is running: sudo systemctl status mysql');
        console.log('- User credentials are correct');
        console.log('- Database "discord_bot" exists');
    }
}

testDatabase();
