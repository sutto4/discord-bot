const axios = require('axios');

async function testBotAPI() {
  const guildId = '1403257704222429224';
  const botUrl = 'http://localhost:3001'; // Adjust if different port
  
  try {
    console.log(`🧪 Testing bot API for guild ${guildId}...\n`);
    
    const response = await axios.get(`${botUrl}/api/guilds/${guildId}/features`);
    
    console.log('Bot API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check if all features are true
    const features = response.data.features;
    const allTrue = Object.values(features).every(value => value === true);
    
    console.log(`\nAll features true: ${allTrue}`);
    
    if (!allTrue) {
      console.log('Features that are false:');
      Object.entries(features).forEach(([key, value]) => {
        if (value === false) {
          console.log(`  ${key}: ${value}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error testing bot API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testBotAPI();
