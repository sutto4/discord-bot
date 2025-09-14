const mysql = require('mysql2/promise');

async function debugSpecificGuild() {
  const connection = await mysql.createConnection({
    host: process.env.APP_DB_HOST || process.env.BOT_DB_HOST || '127.0.0.1',
    user: process.env.APP_DB_USER || process.env.BOT_DB_USER || 'root',
    password: process.env.APP_DB_PASSWORD || process.env.BOT_DB_PASSWORD || '',
    database: process.env.APP_DB_NAME || process.env.BOT_DB_NAME || 'chester_bot',
    port: Number(process.env.APP_DB_PORT || process.env.BOT_DB_PORT || 3306)
  });

  const guildId = '1403257704222429224';

  try {
    console.log(`🔍 Debugging guild ${guildId}...\n`);

    // 1. Check guild premium status
    const [guildRows] = await connection.execute(
      "SELECT guild_id, name, premium FROM guilds WHERE guild_id = ?",
      [guildId]
    );
    console.log('--- Guild Record ---');
    if (guildRows.length > 0) {
      console.log(guildRows[0]);
      console.log(`Is Premium: ${guildRows[0].premium === 1}\n`);
    } else {
      console.log('No record found for this guild in the "guilds" table.\n');
    }

    // 2. Check guild feature overrides
    const [guildFeatureRows] = await connection.execute(
      "SELECT id, feature_key, enabled FROM guild_features WHERE guild_id = ? ORDER BY id",
      [guildId]
    );
    console.log('--- Guild Feature Overrides (guild_features table) ---');
    if (guildFeatureRows.length > 0) {
      guildFeatureRows.forEach(row => console.log(row));
    } else {
      console.log('No specific feature overrides found for this guild.\n');
    }

    // 3. Check all available features
    const [featureRows] = await connection.execute(
      "SELECT feature_key, feature_name, minimum_package, is_active FROM features WHERE is_active = 1 ORDER BY feature_key"
    );
    console.log('\n--- All Active Features (features table) ---');
    featureRows.forEach(row => console.log(row));

    // 4. Find problematic entries (feature_key that doesn't match any real feature_key)
    console.log('\n--- Checking for problematic entries ---');
    const validFeatureKeys = featureRows.map(f => f.feature_key);
    const problematicEntries = guildFeatureRows.filter(row => 
      !validFeatureKeys.includes(row.feature_key)
    );
    
    if (problematicEntries.length > 0) {
      console.log('Found problematic entries (feature_key not in features table):');
      problematicEntries.forEach(entry => {
        console.log(`  ID ${entry.id}: "${entry.feature_key}" (should be a valid feature_key)`);
      });
      
      // Fix the problematic entries
      console.log('\n🔧 Fixing problematic entries...');
      for (const entry of problematicEntries) {
        // Try to find the correct feature_key by matching feature_name
        const correctFeature = featureRows.find(f => f.feature_name === entry.feature_key);
        if (correctFeature) {
          console.log(`  Fixing ID ${entry.id}: "${entry.feature_key}" -> "${correctFeature.feature_key}"`);
          await connection.execute(
            'UPDATE guild_features SET feature_key = ? WHERE id = ?',
            [correctFeature.feature_key, entry.id]
          );
        } else {
          console.log(`  Deleting ID ${entry.id}: "${entry.feature_key}" (no matching feature found)`);
          await connection.execute(
            'DELETE FROM guild_features WHERE id = ?',
            [entry.id]
          );
        }
      }
    } else {
      console.log('No problematic entries found.');
    }

    // 5. Test the buildFeatureFlags logic manually
    console.log('\n--- Testing buildFeatureFlags logic ---');
    const isPremium = guildRows.length > 0 && guildRows[0].premium === 1;
    console.log(`Guild is premium: ${isPremium}`);

    // Get updated guild overrides after fixes
    const [updatedGuildFeatureRows] = await connection.execute(
      "SELECT feature_key, enabled FROM guild_features WHERE guild_id = ?",
      [guildId]
    );
    
    const guildOverrides = {};
    for (const row of updatedGuildFeatureRows) {
      guildOverrides[row.feature_key] = row.enabled === 1 || row.enabled === "1";
    }
    console.log('Guild overrides:', guildOverrides);

    // Build features object
    const features = {};
    for (const feature of featureRows) {
      const featureKey = feature.feature_key;
      const isPremiumFeature = feature.minimum_package === 'premium';
      
      if (guildOverrides.hasOwnProperty(featureKey)) {
        features[featureKey] = guildOverrides[featureKey];
        console.log(`${featureKey}: ${features[featureKey]} (guild override)`);
      } else {
        if (isPremiumFeature) {
          features[featureKey] = isPremium;
          console.log(`${featureKey}: ${features[featureKey]} (premium feature, guild premium: ${isPremium})`);
        } else {
          features[featureKey] = true;
          console.log(`${featureKey}: ${features[featureKey]} (free feature)`);
        }
      }
    }

    console.log('\nFinal features object:', features);

  } catch (error) {
    console.error('Error during debugging:', error);
  } finally {
    await connection.end();
  }
}

debugSpecificGuild();
