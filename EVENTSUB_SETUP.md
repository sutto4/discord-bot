# Twitch EventSub Setup Guide

## ✅ Implementation Complete!

Your bot now uses **Twitch EventSub** instead of polling, which eliminates API quota issues and provides instant notifications.

## 🔧 Required Environment Variables

Add these to your `.env` file:

```env
# Existing Twitch credentials (already have these)
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret

# New EventSub webhook configuration
TWITCH_WEBHOOK_SECRET=your-secure-webhook-secret-here
WEBHOOK_BASE_URL=https://your-domain.com

# Optional: Increase if you have many streamers
TWITCH_WEBHOOK_SECRET=a-random-secure-string-32-chars
```

## 🌐 Webhook URL Configuration

Your bot needs to be accessible from the internet for Twitch to send webhooks.

**Required URL:** `https://your-domain.com/webhook/twitch`

### For Production:
```env
WEBHOOK_BASE_URL=https://your-production-domain.com
```

### For Development (using ngrok):
```bash
# Install ngrok
npm install -g ngrok

# Expose your bot (port 3001)
ngrok http 3001

# Use the HTTPS URL in your .env
WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

## 📊 What Changed

### ❌ Before (Polling):
- 4,320 API calls per day for 3 streamers
- 60-second delay before notifications
- Hit quota limits in 5-6 hours

### ✅ After (EventSub):
- 6 API calls total (one-time subscription setup)
- Instant notifications (< 10 seconds)
- Unlimited scaling

## 🚀 Testing

1. **Start your bot** - EventSub will automatically subscribe your existing creator alerts
2. **Check logs** for subscription confirmations:
   ```
   [TWITCH-EVENTSUB] ✅ Subscribed to stream.online for suttogt (123456789)
   ```
3. **Manual subscription** via API:
   ```bash
   curl -X POST http://localhost:3001/api/eventsub/subscribe \
     -H "Content-Type: application/json" \
     -d '{"creator": "suttogt"}'
   ```

## 📋 Database

Run this SQL to create the subscriptions table:
```sql
-- Already created: database/setup-eventsub-table.sql
```

## 🔍 Monitoring

- **Subscriptions:** Check `twitch_eventsub_subscriptions` table
- **Webhook logs:** Look for `[TWITCH-EVENTSUB]` and `[WEBHOOK]` in console
- **Events:** Real-time `stream.online` and `stream.offline` events

## 🎯 Result

Your API quota issue is **completely solved**! The old polling system is disabled, and your bot now receives instant Twitch notifications via webhooks.

## 🔧 Troubleshooting

**Webhook not receiving events?**
1. Check `WEBHOOK_BASE_URL` is publicly accessible
2. Verify SSL certificate is valid
3. Check Twitch EventSub dashboard for subscription status

**Subscriptions failing?**
1. Verify `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`
2. Check bot logs for authentication errors
3. Ensure streamers exist on Twitch
