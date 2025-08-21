# Creator Alerts - Discord Bot Integration

This feature allows Discord servers to automatically detect when Twitch streamers go live and send notifications to designated channels.

## Features

- **Twitch Integration**: Monitors Twitch streams using the Helix API
- **Discord Notifications**: Sends rich embedded messages when creators go live/offline
- **Role Management**: Can automatically assign/remove Discord roles (requires user mapping)
- **Configurable**: Set different channels, roles, and creators per server
- **Real-time**: Polls Twitch API every 60 seconds (configurable)

## Setup

### 1. Environment Variables

Add these to your `.env` file in the discord-bot directory:

```bash
# Twitch API credentials
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret

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

- **Platform**: Currently supports Twitch
- **Creator**: Twitch username (e.g., "shroud")
- **Role**: Discord role ID to assign (optional)
- **Channel**: Discord channel ID for notifications
- **Notes**: Optional description

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
[CREATOR-ALERTS] Processing 2 enabled Twitch creator alert rules
[CREATOR-ALERTS] Processing rule 1 for creator shroud in guild 123456789012345678
[CREATOR-ALERTS] shroud just went live on Twitch in guild 123456789012345678
[CREATOR-ALERTS] Sent live notification for shroud in guild ServerName
```

## Troubleshooting

### Common Issues

1. **"Could not get Twitch user ID"**
   - Check if the Twitch username is correct
   - Verify Twitch API credentials in environment variables

2. **"Guild not found"**
   - Ensure the bot is in the Discord server
   - Check the guild ID in the database

3. **"Channel not found"**
   - Verify the channel ID exists
   - Ensure the bot has permission to send messages in that channel

4. **Role assignment not working**
   - Check if user mapping exists in `creator_alert_user_mapping` table
   - Verify the bot has permission to manage roles

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
