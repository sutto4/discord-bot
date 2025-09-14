const mysql = require('mysql2/promise');

// Load environment variables from .env file
require('dotenv').config();

async function testFeaturesDirect() {
  const connection = await mysql.createConnection({
    host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
    user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
    password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
    database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
    port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306)
  });

  const guildId = '1403257704222429224';

  try {
    console.log(`🧪 Testing features directly for guild ${guildId}...\n`);

    // 1. Get guild premium status
    const [guildRows] = await connection.execute(
      "SELECT premium FROM guilds WHERE guild_id = ?",
      [guildId]
    );
    const isPremium = guildRows.length > 0 && guildRows[0].premium === 1;
    
    console.log(`Guild premium status: ${isPremium}`);

    // 2. Get all available features
    const [featureRows] = await connection.execute(
      "SELECT feature_key, minimum_package FROM features WHERE is_active = 1"
    );
    
    console.log(`Available features: ${featureRows.length}`);
    featureRows.forEach(f => console.log(`  ${f.feature_key} (${f.minimum_package})`));

    // 3. Get guild overrides
    const [guildFeatureRows] = await connection.execute(
      "SELECT feature_key, enabled FROM guild_features WHERE guild_id = ?",
      [guildId]
    );
    
    console.log(`\nGuild overrides: ${guildFeatureRows.length}`);
    guildFeatureRows.forEach(row => console.log(`  ${row.feature_key}: ${row.enabled}`));

    // 4. Build features object (same logic as buildFeatureFlags)
    const guildOverrides = {};
    for (const row of guildFeatureRows) {
      guildOverrides[row.feature_key] = row.enabled === 1 || row.enabled === "1";
    }

    const features = {};
    for (const feature of featureRows) {
      const featureKey = feature.feature_key;
      const isPremiumFeature = feature.minimum_package === 'premium';
      
      if (guildOverrides.hasOwnProperty(featureKey)) {
        features[featureKey] = guildOverrides[featureKey];
        console.log(`${featureKey}: ${features[featureKey]} (override)`);
      } else {
        if (isPremiumFeature) {
          features[featureKey] = isPremium;
          console.log(`${featureKey}: ${features[featureKey]} (premium, guild premium: ${isPremium})`);
        } else {
          features[featureKey] = true;
          console.log(`${featureKey}: ${features[featureKey]} (free)`);
        }
      }
    }

    console.log('\n🎯 Final result:');
    console.log(JSON.stringify({ guildId, features }, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

testFeaturesDirect();
