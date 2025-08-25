# Creator Alerts - Discord Bot Integration

This feature allows Discord servers to automatically detect when creators go live on multiple platforms and send notifications to designated channels.

## Features

- **Multi-Platform Support**: Monitors Twitch, YouTube, Kick, and TikTok streams
- **Discord Notifications**: Sends rich embedded messages when creators go live/offline
- **Role Management**: Can automatically assign/remove Discord roles (requires user mapping)
- **Configurable**: Set different channels, roles, and creators per server
- **Real-time**: Polls platform APIs every 60 seconds (configurable)
- **Platform-Specific Styling**: Each platform has unique colors, icons, and information

## Supported Platforms

### 🎮 Twitch
- **API**: Official Twitch Helix API with OAuth2
- **Features**: Live stream detection, viewer count, game category, stream thumbnails
- **Requirements**: `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`

### 📺 YouTube
- **API**: YouTube Data API v3
- **Features**: Live stream detection, channel information
- **Requirements**: `YOUTUBE_API_KEY`

### 🥊 Kick
- **API**: Public Kick API
- **Features**: Live stream detection, viewer count, stream title
- **Requirements**: No API key required

### 📱 TikTok
- **API**: Basic HTML parsing (limited)
- **Features**: Basic live stream detection
- **Requirements**: No API key required (note: detection may be limited)

## Setup

### 1. Environment Variables

Add these to your `.env` file in the discord-bot directory:

```bash
# Twitch API credentials
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret

# YouTube API key
YOUTUBE_API_KEY=your_youtube_api_key

# Optional: Customize polling interval (in seconds)
CREATOR_ALERTS_POLL_SECONDS=60
```

### 2. Database Tables

Run the SQL scripts to create the necessary tables:

```sql
-- Main creator alert rules table
-- (Already created in the main setup)

-- User mapping table for role assignment
-- Run: setup-creator-alerts-mapping.sql

-- Add Kick platform support (if not already present)
-- Run: setup-creator-alerts-add-kick.sql
```

### 3. Install Dependencies

```bash
cd discord-bot
npm install
# or
pnpm install
```

### 4. Restart the Bot

The creator alerts worker will automatically start with the bot and run every 60 seconds.

## How It Works

1. **Polling**: Every 60 seconds, the bot checks all enabled creator alert rules
2. **Twitch API**: For each rule, it queries Twitch to see if the creator is live
3. **Status Change Detection**: Uses an in-memory cache to detect when creators go live/offline
4. **Notifications**: Sends Discord embeds to the configured channel
5. **Role Management**: Can assign/remove roles if user mapping is configured

## Configuration

### Creating Creator Alert Rules

Use the web interface at `/guilds/[id]/creator-alerts` to create rules:

- **Platform**: Choose from Twitch, YouTube, Kick, TikTok, or X
- **Creator**: Platform-specific username/handle
  - Twitch: Username (e.g., "shroud")
  - YouTube: Channel name or @handle (e.g., "@PewDiePie")
  - Kick: Username (e.g., "xqc")
  - TikTok: Username (e.g., "@charlidamelio")
- **Role**: Discord role ID to assign (optional)
- **Channel**: Discord channel ID for notifications
- **Notes**: Optional description

### Platform-Specific Requirements

#### Twitch
- Requires valid `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`
- Username should match exactly (case-insensitive)
- Supports full stream metadata and thumbnails

#### YouTube
- Requires valid `YOUTUBE_API_KEY`
- Can use channel name or @handle format
- API quota limits apply (check your Google Cloud Console)

#### Kick
- No API key required
- Uses public API endpoints
- Username should match exactly

#### TikTok
- No API key required
- Basic live stream detection only
- May have limited reliability due to platform restrictions

### User Mapping for Role Assignment

To enable automatic role assignment, you need to map Twitch usernames to Discord user IDs:

```sql
INSERT INTO creator_alert_user_mapping (guild_id, twitch_username, discord_user_id) 
VALUES ('123456789012345678', 'shroud', '987654321098765432');
```

## API Endpoints

The web interface uses these API endpoints:

- `GET /api/guilds/[id]/creator-alerts` - List all rules
- `POST /api/guilds/[id]/creator-alerts` - Create new rule
- `PUT /api/guilds/[id]/creator-alerts/[id]` - Update rule
- `DELETE /api/guilds/[id]/creator-alerts/[id]` - Delete rule
- `GET /api/guilds/[id]/channels` - Get available Discord channels
- `GET /api/guilds/[id]/roles` - Get available Discord roles

## Logging

The bot logs all creator alert activities with the `[CREATOR-ALERTS]` prefix:

```
[CREATOR-ALERTS] Starting creator alerts processing...
[CREATOR-ALERTS] Processing 5 enabled creator alert rules: { twitch: 2, youtube: 1, kick: 1, tiktok: 1 }
[CREATOR-ALERTS] Processing rule 1 for creator shroud in guild 123456789012345678
[CREATOR-ALERTS] Stream data for shroud: LIVE
[CREATOR-ALERTS] shroud just went live on twitch in guild 123456789012345678
[CREATOR-ALERTS] Role assigned to Discord user 987654321098765432 for shroud
[CREATOR-ALERTS] Sent live notification for shroud in guild ServerName
```

### Platform-Specific Logs

- **Twitch**: Full stream metadata, profile pictures, thumbnails
- **YouTube**: Channel information, live stream status
- **Kick**: Stream details, viewer count, session information
- **TikTok**: Basic live status detection

## Troubleshooting

### Common Issues

#### Twitch
- **API Errors**: Check `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`
- **Rate Limits**: Twitch API has rate limits; check logs for 429 errors
- **Token Expiry**: Bot automatically refreshes OAuth tokens

#### YouTube
- **API Errors**: Verify `YOUTUBE_API_KEY` is valid
- **Quota Limits**: Check Google Cloud Console for API quota usage
- **Channel Not Found**: Ensure channel name/handle is correct

#### Kick
- **Channel Not Found**: Verify username exists on Kick
- **API Errors**: Kick's public API may have rate limits
- **Limited Data**: Some stream information may be unavailable

#### TikTok
- **Detection Issues**: TikTok detection is limited due to API restrictions
- **False Negatives**: May not detect all live streams
- **Rate Limits**: Basic HTML parsing may be blocked

#### General
- **Role Assignment Failures**: Ensure bot has `MANAGE_ROLES` permission
- **Cache Issues**: Use the clear cache API endpoint if needed
- **Permission Errors**: Check bot permissions in Discord server

### Debug Mode

To enable more verbose logging, you can temporarily modify the polling interval:

```bash
CREATOR_ALERTS_POLL_SECONDS=10  # Check every 10 seconds for testing
```

## Future Enhancements

- Support for YouTube, X (Twitter), and TikTok
- Webhook-based streaming (faster than polling)
- Custom notification templates
- Analytics and reporting
- Bulk user mapping import/export

## Security Notes

- The bot only processes rules for servers it's in
- All API calls use the bot's permissions, not user tokens
- Rate limiting is handled by Twitch's API
- User mapping is server-specific and isolated
