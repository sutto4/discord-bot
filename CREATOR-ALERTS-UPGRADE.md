# Creator Alerts Upgrade - Role Mentions & Assignments

## Overview
This upgrade adds support for:
1. **Role Mentions** - Ping specific roles when a notification is posted (e.g., @everyone, @StreamNotifications)
2. **Role Assignment** - Automatically assign a role to the creator when they go live (e.g., "🔴 LIVE" role)

## Database Migration

Run this SQL on your database:

```sql
ALTER TABLE creator_alert_rules 
ADD COLUMN mention_role_ids TEXT NULL COMMENT 'JSON array of role IDs to mention in notifications' 
AFTER role_id;
```

Or use the migration file:
```bash
cd /home/discordbot/chester-bot
mysql -u your_user -p your_database < database/add-mention-roles-column.sql
```

## Features

### Role Mentions (New)
- Stored in `mention_role_ids` column as JSON array
- Supports multiple roles (e.g., `["123", "456"]`)
- Roles are mentioned at the start of the notification message
- Example: `@StreamFans @Subscribers desyncmusictv has just gone live!`

### Role Assignment (Existing, Enhanced)
- Stored in `role_id` column
- Automatically assigns role to creator when they go live
- Automatically removes role when they go offline
- Requires Discord user mapping (via `discord_user_id`)

## Usage

1. **Role Mentions** - Select checkboxes for roles to ping in notifications
2. **Role Assignment** - Select dropdown for role to assign to creator
3. Both are optional and work independently

## Code Changes

- ✅ Frontend: Updated `creator-alerts-panel.tsx` with multi-select checkboxes
- ✅ Backend: Updated API routes to handle `mention_role_ids` JSON field
- ✅ Bot: Updated `twitchEventSub.js` to:
  - Parse `mention_role_ids` and include in notification
  - Assign `role_id` when stream goes online
  - Remove `role_id` when stream goes offline

