// Delete all failed Twitch EventSub subscriptions
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

async function deleteAllSubscriptions() {
    try {
        const token = await getTwitchToken();
        
        // Get all subscriptions
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        console.log(`\nFound ${data.total} subscriptions`);
        console.log('Deleting all subscriptions...\n');
        
        let deleted = 0;
        let failed = 0;
        
        for (const sub of data.data || []) {
            try {
                const deleteResponse = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${sub.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Client-ID': TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (deleteResponse.status === 204) {
                    deleted++;
                    if (deleted % 10 === 0) {
                        console.log(`Deleted ${deleted}/${data.total}...`);
                    }
                } else {
                    failed++;
                    console.error(`Failed to delete ${sub.id}: ${deleteResponse.status}`);
                }
            } catch (error) {
                failed++;
                console.error(`Error deleting ${sub.id}:`, error.message);
            }
        }
        
        console.log(`\n✅ Deleted: ${deleted}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`\nAll subscriptions cleaned up! You can now restart the bot to create new ones with the correct URL.\n`);
        
    } catch (error) {
        console.error('Error deleting subscriptions:', error);
    }
}

deleteAllSubscriptions();


