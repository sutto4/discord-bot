# Creator Alerts - Hybrid System

## Overview

The Creator Alerts system uses a **hybrid approach** to monitor different streaming platforms:

### 🔴 Twitch - EventSub (Real-time Webhooks)
- **Method**: Real-time webhooks via Twitch EventSub
- **Benefits**:
  - Instant notifications (no delay)
  - Zero API calls (Twitch pushes data to us)
  - No rate limits
  - More reliable and efficient
- **Requirements**:
  - Publicly accessible webhook URL (`/webhook/twitch`)
  - Twitch webhook secret configured in `.env`
  - EventSub subscriptions managed automatically

### 📺 YouTube / Kick / TikTok / X - Polling
- **Method**: Regular polling (checks every 5 minutes by default)
- **Benefits**:
  - Works without public webhook
  - Simple to set up
  - Consistent across all platforms
- **Limitations**:
  - Up to 5-minute delay in notifications
  - Uses API calls (quotas apply)
- **Configuration**: `CREATOR_ALERTS_POLL_SECONDS=300` (5 minutes)

## How It Works

### On Bot Startup:
1. **Twitch alerts** are automatically subscribed to EventSub webhooks
2. **Non-Twitch alerts** start polling immediately
3. Polling continues every 5 minutes for YouTube/Kick/TikTok/X

### When a Stream Goes Live:

**Twitch (EventSub):**
1. Twitch sends webhook notification → `/webhook/twitch`
2. Bot receives instant notification
3. Alert sent to Discord immediately
4. Role assigned (if configured)

**YouTube/Kick/TikTok (Polling):**
1. Bot checks platform API every 5 minutes
2. Detects live status change
3. Alert sent to Discord (up to 5-minute delay)
4. Role assigned (if configured)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Creator Alerts                      │
│                  Hybrid System                       │
└─────────────────────────────────────────────────────┘
           │                          │
           ▼                          ▼
   ┌──────────────┐          ┌──────────────────┐
   │   Twitch     │          │  YouTube / Kick  │
   │  (EventSub)  │          │   TikTok / X     │
   │              │          │   (Polling)      │
   └──────────────┘          └──────────────────┘
           │                          │
     Real-time                  Every 5 min
    webhooks ⚡                   API calls 🔄
           │                          │
           ▼                          ▼
   ┌──────────────────────────────────────────┐
   │        Discord Notifications              │
   │    • Embedded message with stream info    │
   │    • Optional role assignment             │
   │    • Custom message support               │
   └──────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Twitch EventSub (for real-time notifications)
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_WEBHOOK_SECRET=your_webhook_secret

# YouTube API (for polling)
YOUTUBE_API_KEY=your_youtube_api_key

# Polling interval for non-Twitch platforms (seconds)
CREATOR_ALERTS_POLL_SECONDS=300  # Default: 5 minutes
```

### Database Tables

- `creator_alert_rules` - Stores all alert configurations
- `twitch_eventsub_subscriptions` - Tracks Twitch webhook subscriptions
- `creator_alert_cache` - Caches live/offline status to detect state changes

## API Usage & Quotas

### Twitch (EventSub)
- **API Calls**: 0 per check (webhook-based)
- **Quota**: No limits for webhooks
- **Latency**: <1 second (real-time)

### YouTube (Polling)
- **API Calls**: 2 per creator per check
  - 1 call to search for live streams
  - 1 call to get stream details
- **Daily Quota**: 10,000 API calls
  - With 300-second polling: ~150 checks/day per creator
  - Can monitor ~50 creators safely
- **Latency**: 0-5 minutes (depends on polling interval)

### Kick / TikTok (Polling)
- **API Calls**: 1 per creator per check (public APIs)
- **Quota**: No strict limits (public endpoints)
- **Latency**: 0-5 minutes

## Troubleshooting

### Twitch Alerts Not Working
1. Check webhook is publicly accessible
2. Verify `TWITCH_WEBHOOK_SECRET` is set correctly
3. Check EventSub subscriptions in database
4. Look for `[TWITCH-EVENTSUB]` logs

### YouTube Alerts Not Working
1. Verify `YOUTUBE_API_KEY` is valid
2. Check API quota hasn't been exceeded
3. Ensure YouTube Data API v3 is enabled
4. Look for `[CREATOR-ALERTS]` logs

### Polling Not Running
1. Check bot startup logs for "Starting hybrid polling"
2. Verify `processCreatorAlerts` is being called
3. Check for errors in console

## Performance Recommendations

### For Mostly Twitch Alerts:
- Default configuration is optimal
- EventSub handles Twitch automatically
- Polling only runs for non-Twitch platforms

### For Many YouTube Channels:
- Increase polling interval to 10 minutes (`CREATOR_ALERTS_POLL_SECONDS=600`)
- Monitor YouTube API quota usage
- Consider prioritizing most important channels

### For Mixed Platforms:
- Keep default 5-minute polling
- EventSub handles Twitch efficiently
- YouTube/Kick/TikTok poll together

## Logs to Monitor

```
[CREATOR-ALERTS] Starting hybrid polling for non-Twitch platforms every 5 minutes
[CREATOR-ALERTS] Processing X non-Twitch alert rules (Twitch uses EventSub): { youtube: 5, kick: 2 }
[TWITCH-EVENTSUB] ✅ Subscribed to stream.online for username (12345)
[TWITCH-EVENTSUB] 🔴 username went live: Stream Title
[CREATOR-ALERTS] 🔴 youtube_channel went live on youtube
```

## Migration from Old System

The old system used polling for ALL platforms including Twitch. The hybrid system:
- **Automatically upgrades** existing Twitch alerts to EventSub on bot startup
- **Maintains polling** for non-Twitch platforms
- **No configuration changes needed** - it just works better!

## Benefits Summary

| Feature | Old System (Polling) | New System (Hybrid) |
|---------|---------------------|---------------------|
| Twitch Latency | 0-5 minutes | <1 second ⚡ |
| Twitch API Calls | 2 per check | 0 per check ✅ |
| YouTube Support | ✅ Polling | ✅ Polling |
| Kick Support | ✅ Polling | ✅ Polling |
| Setup Complexity | Simple | Simple |
| Reliability | Good | Excellent |

---

**Last Updated**: 2025-10-09
**Version**: 2.0 (Hybrid System)

