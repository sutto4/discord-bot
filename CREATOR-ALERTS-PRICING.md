# Creator Alerts - Free vs Premium Limits

## Tier Comparison

### 🆓 Free Tier
- **Max Alerts**: 2 creators
- **Platforms**: Twitch only (recommended)
- **Role Mentions**: ❌ Disabled (Premium only)
- **Role Assignment**: ❌ Disabled (Premium only)
- **Custom Messages**: ✅ Basic
- **Notification Channels**: 1 per alert
- **Update Frequency**: Every 60 seconds (polling) or Real-time (EventSub for Twitch)

### 💎 Premium Tier
- **Max Alerts**: Unlimited
- **Platforms**: ✅ All (Twitch, YouTube, Kick, TikTok, X)
- **Role Mentions**: ✅ Multiple roles
- **Role Assignment**: ✅ Auto-assign "LIVE" role
- **Custom Messages**: ✅ Full customization
- **Notification Channels**: Multiple per alert
- **Update Frequency**: Real-time (EventSub) + Polling
- **Priority**: Faster polling intervals

## Competitive Analysis

| Bot | Free Limit | Premium Limit | Price |
|-----|-----------|---------------|-------|
| **MEE6** | 1 social alert | Unlimited | $11.95/mo |
| **ProBot** | Limited | Expanded | $5/mo |
| **NotSoBot** | 3 streamers | Unlimited | $3/mo |
| **ServerMate** | 2 creators | Unlimited | TBD |

## Technical Constraints

### Twitch EventSub
- **Max Subscriptions**: 10,000 per app (globally)
- **Cost per Creator**: 2 subscriptions (stream.online + stream.offline)
- **Max Creators (Technical)**: 5,000 creators across all servers
- **Rate Limit**: 800 subscription requests per minute

### API Polling (YouTube, Kick, etc.)
- **Free Tier**: 60-second intervals
- **Premium Tier**: 30-second intervals (optional)
- **Impact**: More creators = more API calls = higher costs

### Discord Rate Limits
- **Global**: 50 requests/second per bot
- **Per Channel**: 5 messages/5 seconds
- **Consideration**: Burst notifications when multiple creators go live simultaneously

## Implementation Status

✅ **Frontend**
- Limit check in UI (2 max for free)
- Upgrade banner when limit reached
- Disabled form when at limit
- Badge showing X/2 usage

✅ **Backend** (Ready)
- Premium detection via `web-app-features` API
- Role mentions stored in `mention_role_ids` (JSON array)
- Role assignment via `role_id` column

## Future Premium Features (Optional)

1. **Smart Notifications** - Only notify if first stream in X hours (reduce spam)
2. **Custom Embed Colors** - Brand colors per alert
3. **Stream Analytics** - Track viewer counts, stream duration
4. **Scheduled Streams** - Notify about upcoming scheduled streams
5. **Multiple Channels** - Send same alert to multiple Discord channels
6. **Platform Filters** - Different templates per platform
7. **Viewer Threshold** - Only notify if stream has X+ viewers
8. **Priority Alerts** - Faster polling (30s vs 60s)

## Recommended Pricing

Based on competitor analysis:
- **$3-5/month** - Competitive with NotSoBot, undercuts MEE6
- **$30-40/year** - Annual discount option
- **Per-Server** - Each server needs its own premium subscription

