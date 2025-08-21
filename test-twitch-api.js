#!/usr/bin/env node

// Test script for Twitch API integration
// Run with: node test-twitch-api.js

require('dotenv').config();
const fetch = require('node-fetch');

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_TOKEN_URL = process.env.TWITCH_TOKEN_URL || 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_BASE = process.env.TWITCH_API_BASE || 'https://api.twitch.tv/helix';

async function testTwitchAPI() {
    console.log('🧪 Testing Twitch API Integration...\n');
    
    // Check environment variables
    console.log('📋 Environment Variables:');
    console.log(`   TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
    console.log(`   TWITCH_TOKEN_URL: ${TWITCH_TOKEN_URL}`);
    console.log(`   TWITCH_API_BASE: ${TWITCH_API_BASE}\n`);
    
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        console.error('❌ Missing required environment variables. Please check your .env file.');
        process.exit(1);
    }
    
    try {
        // Test 1: Get access token
        console.log('🔑 Test 1: Getting Twitch access token...');
        const tokenResponse = await fetch(TWITCH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });
        
        if (!tokenResponse.ok) {
            throw new Error(`Failed to get token: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }
        
        const tokenData = await tokenResponse.json();
        console.log(`   ✅ Token obtained successfully`);
        console.log(`   📊 Token expires in: ${tokenData.expires_in} seconds\n`);
        
        // Test 2: Get user info (test with a known Twitch user)
        console.log('👤 Test 2: Getting Twitch user info...');
        const testUsername = 'shroud'; // Known Twitch user for testing
        
        const userResponse = await fetch(`${TWITCH_API_BASE}/users?login=${encodeURIComponent(testUsername)}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });
        
        if (!userResponse.ok) {
            throw new Error(`Failed to get user: ${userResponse.status} ${userResponse.statusText}`);
        }
        
        const userData = await userResponse.json();
        if (userData.data.length > 0) {
            const user = userData.data[0];
            console.log(`   ✅ User found: ${user.display_name} (ID: ${user.id})`);
            console.log(`   📊 Followers: ${user.view_count || 'N/A'}`);
            console.log(`   📺 Partner: ${user.broadcaster_type || 'N/A'}\n`);
        } else {
            console.log(`   ⚠️  User '${testUsername}' not found\n`);
        }
        
        // Test 3: Check if user is live
        console.log('📺 Test 3: Checking stream status...');
        if (userData.data.length > 0) {
            const userId = userData.data[0].id;
            
            const streamResponse = await fetch(`${TWITCH_API_BASE}/streams?user_id=${userId}`, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });
            
            if (!streamResponse.ok) {
                throw new Error(`Failed to get streams: ${streamResponse.status} ${streamResponse.statusText}`);
            }
            
            const streamData = await streamResponse.json();
            if (streamData.data.length > 0) {
                const stream = streamData.data[0];
                console.log(`   🎮 ${testUsername} is LIVE!`);
                console.log(`   📝 Title: ${stream.title}`);
                console.log(`   🎯 Game: ${stream.game_name}`);
                console.log(`   👥 Viewers: ${stream.viewer_count}`);
                console.log(`   📺 Language: ${stream.language}\n`);
            } else {
                console.log(`   📺 ${testUsername} is currently offline\n`);
            }
        }
        
        // Test 4: Rate limit info
        console.log('⏱️  Test 4: Checking rate limits...');
        const rateLimitRemaining = userResponse.headers.get('ratelimit-remaining');
        const rateLimitReset = userResponse.headers.get('ratelimit-reset');
        
        if (rateLimitRemaining !== null) {
            console.log(`   📊 Remaining requests: ${rateLimitRemaining}`);
            if (rateLimitReset) {
                const resetTime = new Date(parseInt(rateLimitReset) * 1000);
                console.log(`   🔄 Rate limit resets at: ${resetTime.toLocaleString()}`);
            }
        } else {
            console.log(`   📊 Rate limit headers not available`);
        }
        
        console.log('\n🎉 All tests completed successfully!');
        console.log('✅ Twitch API integration is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        
        if (error.message.includes('401')) {
            console.log('\n💡 This usually means:');
            console.log('   - Invalid client ID or secret');
            console.log('   - Incorrect environment variables');
            console.log('   - Twitch API credentials are wrong');
        } else if (error.message.includes('429')) {
            console.log('\n💡 This means you\'ve hit the rate limit.');
            console.log('   Wait a bit and try again.');
        }
        
        process.exit(1);
    }
}

// Run the test
testTwitchAPI().catch(console.error);
