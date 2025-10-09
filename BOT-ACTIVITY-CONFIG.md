# Bot Activity Configuration

The bot automatically displays "Watching [X users]" where X is the total member count from all active guilds. This updates automatically every hour.

## Automatic User Count Display

The bot automatically:
- Queries the database for total member count from all active guilds
- Displays "Watching [X users]" in Discord
- Updates every hour automatically
- Shows formatted numbers (e.g., "1,234 users")

## Manual Configuration (Optional)

### Environment Variables (Fallback Only)

These are only used if the automatic user count fails:

```env
# Bot Activity Configuration (startup defaults)
BOT_ACTIVITY_TEXT=your servers
BOT_ACTIVITY_TYPE=WATCHING
```

## Activity Types

- `PLAYING` - Shows as "Playing [text]"
- `WATCHING` - Shows as "Watching [text]" (default)
- `LISTENING` - Shows as "Listening to [text]"
- `STREAMING` - Shows as "Streaming [text]"

## Examples

```env
# Playing a game
BOT_ACTIVITY_TEXT=with users
BOT_ACTIVITY_TYPE=PLAYING

# Watching something
BOT_ACTIVITY_TEXT=your servers
BOT_ACTIVITY_TYPE=WATCHING

# Listening to music
BOT_ACTIVITY_TEXT=your commands
BOT_ACTIVITY_TYPE=LISTENING

# Streaming
BOT_ACTIVITY_TEXT=live coding
BOT_ACTIVITY_TYPE=STREAMING
```

### Admin Interface

Access the bot activity settings in the admin panel at `/admin` under "Bot Settings":
- **Refresh Button**: Manually update the user count display
- **Manual Override**: Optionally set custom activity text
- **Real-time Updates**: Changes take effect immediately

### API Access

Admins can refresh the user count via API:

```bash
# Refresh user count
curl -X POST /api/admin/bot-activity/refresh

# Set custom activity (overrides auto user count)
curl -X POST /api/admin/bot-activity \
  -H "Content-Type: application/json" \
  -d '{
    "text": "your servers",
    "type": "WATCHING"
  }'
```

## Important Notes

- **Automatic**: Bot automatically shows user count from active guilds
- **Hourly Updates**: Activity refreshes every hour automatically
- **Admin Override**: Admins can manually set custom activity via admin panel
- **Global Changes**: Activity changes affect all servers where the bot is present
- **Database Query**: Uses `SUM(member_count) FROM guilds WHERE status = "active"`
- **Formatted Numbers**: Displays numbers with commas (e.g., "1,234 users")
- **Fallback**: If database query fails, falls back to "Watching your servers"
