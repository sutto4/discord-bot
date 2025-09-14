// Quick check to see what code is actually running on the server
console.log('Checking server code...');

// Check if the buildFeatureFlags function exists and has the right structure
const fs = require('fs');
const serverCode = fs.readFileSync('./server.js', 'utf8');

console.log('buildFeatureFlags function exists:', serverCode.includes('buildFeatureFlags'));
console.log('Has premium status check:', serverCode.includes('SELECT premium FROM guilds'));
console.log('Has guild overrides check:', serverCode.includes('SELECT feature_key, enabled FROM guild_features'));
console.log('Has debugging logs:', serverCode.includes('[FEATURES-GET]'));

// Check for any remaining feature_name references
const featureNameMatches = serverCode.match(/feature_name/g);
console.log('feature_name references in server.js:', featureNameMatches ? featureNameMatches.length : 0);

if (featureNameMatches) {
    console.log('Found feature_name references:');
    featureNameMatches.forEach((match, index) => {
        console.log(`  ${index + 1}: ${match}`);
    });
}
