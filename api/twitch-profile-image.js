/**
 * GET /api/twitch/profile-image?username=<username>
 * Fetch Twitch user profile image
 */

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let twitchAccessToken = null;
let twitchTokenExpiry = 0;

// Cache profile images for 24 hours
const profileImageCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get or refresh Twitch access token
 */
async function getTwitchToken() {
    const now = Date.now();
    
    if (twitchAccessToken && now < twitchTokenExpiry) {
        return twitchAccessToken;
    }
    
    try {
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
        
        if (data.access_token) {
            twitchAccessToken = data.access_token;
            twitchTokenExpiry = now + (data.expires_in * 1000) - 60000; // 1 min buffer
            return twitchAccessToken;
        }
    } catch (error) {
        console.error('[TWITCH-API] Error getting token:', error);
    }
    return null;
}

module.exports = async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const lowerUsername = username.toLowerCase();
    
    // Check cache first
    const cached = profileImageCache.get(lowerUsername);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ profileImageUrl: cached.url, cached: true });
    }
    
    const token = await getTwitchToken();
    if (!token) {
      return res.json({ profileImageUrl: null });
    }
    
    const response = await fetch(`https://api.twitch.tv/helix/users?login=${lowerUsername}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    const profileImageUrl = data.data?.[0]?.profile_image_url || null;
    
    // Cache the result
    if (profileImageUrl) {
      profileImageCache.set(lowerUsername, {
        url: profileImageUrl,
        timestamp: Date.now()
      });
    }
    
    return res.json({ profileImageUrl });
  } catch (error) {
    console.error('[TWITCH-PROFILE] Error:', error);
    return res.status(500).json({ error: 'Internal server error', profileImageUrl: null });
  }
};

