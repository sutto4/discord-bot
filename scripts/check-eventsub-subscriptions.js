// Check active Twitch EventSub subscriptions
require('dotenv').config();
const fetch = require('node-fetch');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

async function getTwitchToken() {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });
    const data = await response.json();
    return data.access_token;
}

async function listSubscriptions() {
    try {
        const token = await getTwitchToken();
        
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        console.log('\n=== TWITCH EVENTSUB SUBSCRIPTIONS ===\n');
        console.log(`Total: ${data.total || 0}`);
        console.log(`Max allowed: ${data.max_total_cost || 'Unknown'}`);
        console.log(`Total cost: ${data.total_cost || 0}\n`);
        
        if (data.data && data.data.length > 0) {
            data.data.forEach(sub => {
                console.log(`📡 ${sub.type}`);
                console.log(`   ID: ${sub.id}`);
                console.log(`   Status: ${sub.status}`);
                console.log(`   Broadcaster: ${sub.condition.broadcaster_user_id}`);
                console.log(`   Callback: ${sub.transport.callback}`);
                console.log(`   Created: ${sub.created_at}`);
                console.log('');
            });
        } else {
            console.log('⚠️ No active subscriptions found!\n');
        }
        
        if (data.data && data.data.some(s => s.status === 'webhook_callback_verification_pending')) {
            console.log('⚠️ Some subscriptions are pending verification!');
            console.log('   Twitch needs to verify your webhook endpoint.');
            console.log('   Make sure https://servermate.gg/webhook/twitch is publicly accessible.\n');
        }
        
    } catch (error) {
        console.error('Error listing subscriptions:', error);
    }
}

listSubscriptions();

