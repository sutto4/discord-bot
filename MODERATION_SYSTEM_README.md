# 🛡️ Moderation System

A comprehensive Discord moderation system with slash commands, case management, and database logging.

## ✨ Features

- **Slash Commands**: Modern Discord slash command interface
- **Case Management**: Track all moderation actions with unique case IDs
- **Duration Support**: Temporary bans and mutes with automatic expiration
- **Evidence Tracking**: Attach evidence to moderation cases
- **Audit Logging**: Complete history of all moderation actions
- **Feature-Aware Deployment**: Only deploy to servers with moderation enabled
- **Permission System**: Per-command enable/disable per server
- **Ban Sync**: Synchronize bans across grouped servers (premium feature)

## 🎯 Commands

### Core Moderation Commands

| Command | Description | Permission Required |
|---------|-------------|-------------------|
| `/ban` | Ban a user with optional duration | Ban Members |
| `/unban` | Unban a user by ID | Ban Members |
| `/mute` | Timeout a user temporarily | Moderate Members |
| `/unmute` | Remove timeout from user | Moderate Members |
| `/kick` | Kick a user from server | Kick Members |
| `/warn` | Warn a user (no action) | Moderate Members |
| `/case` | View case details | Any user |
| `/moderation` | Manage system settings | Administrator |

### Command Options

#### `/ban`
- `user`: Target user (required)
- `duration`: Ban duration (e.g., 30d, 2w, 1mo) - optional
- `delete_days`: Days of messages to delete (0-7) - optional
- `reason`: Reason for ban - optional

#### `/mute`
- `user`: Target user (required)
- `duration`: Mute duration (e.g., 30s, 5m, 2h, 1d, 1w) - required
- `reason`: Reason for mute - optional

#### `/moderation`
- `status`: View system status
- `enable <command>`: Enable a specific command
- `disable <command>`: Disable a specific command
- `reset`: Reset all commands to default (enabled)

## 🗄️ Database Schema

The system uses three main tables:

### `moderation_cases`
Stores all moderation actions with case details.

### `moderation_evidence`
Links evidence (images, files, text) to cases.

### `moderation_logs`
Audit trail of all moderation-related actions.

## 🚀 Deployment

### Prerequisites
1. Set environment variables:
   ```bash
   BOT_DB_HOST=your_db_host
   BOT_DB_USER=your_db_user
   BOT_DB_PASSWORD=your_db_password
   BOT_DB_NAME=your_db_name
   TOKEN=your_bot_token
   CLIENT_ID=your_bot_client_id
   ```

2. Ensure the `moderation` feature is enabled in your database:
   ```sql
   INSERT INTO guild_features (guild_id, feature_key, enabled) 
   VALUES ('your_guild_id', 'moderation', 1);
   ```

### Deploy Commands

#### Feature-Aware Deployment (Recommended)
```bash
node deploy-moderation-commands.js
```
Only deploys to servers with the `moderation` feature enabled.

#### Deploy to All Servers
```bash
node deploy-moderation-commands.js --all
```

#### Preview Deployment
```bash
node deploy-moderation-commands.js --dry-run
```

## ⚙️ Configuration

### Per-Server Command Control
Use `/moderation` command to enable/disable specific commands per server.

### Log Channel
Set a dedicated channel for moderation logs (premium feature).

### Ban Sync
Enable automatic ban synchronization across grouped servers (premium feature).

## 🔧 Customization

### Duration Format
The system supports flexible duration formats:
- `30s` - 30 seconds
- `5m` - 5 minutes
- `2h` - 2 hours
- `1d` - 1 day
- `1w` - 1 week
- `1mo` - 1 month (for bans only)

### Case ID Format
Case IDs follow the pattern: `guildId-timestamp-random`

### Embed Colors
Each action type has a distinct color:
- Ban: Red (#FF0000)
- Unban: Green (#00FF00)
- Mute: Orange (#FFA500)
- Unmute: Blue (#0000FF)
- Kick: Dark Orange (#FF8C00)
- Warn: Gold (#FFD700)

## 🛡️ Security Features

- **Permission Checks**: Commands respect Discord role permissions
- **User Validation**: Ensures users can be moderated before taking action
- **Audit Trail**: All actions are logged with moderator information
- **Rate Limiting**: Built-in delays to respect Discord API limits

## 📊 Monitoring

### Console Logging
All moderation actions are logged to console for debugging.

### Database Logging
Complete audit trail stored in database for UI consumption.

### Error Handling
Graceful error handling with user-friendly error messages.

## 🔄 Future Enhancements

- **Custom Modals**: Advanced input forms for moderation actions
- **Bulk Actions**: Moderate multiple users simultaneously
- **Auto-Moderation**: Automated rule enforcement
- **Appeal System**: User appeal workflow
- **Statistics Dashboard**: Advanced analytics and reporting

## 📝 Usage Examples

### Basic Ban
```
/ban user:@username reason:Breaking server rules
```

### Temporary Mute
```
/mute user:@username duration:2h reason:Spam in general chat
```

### View Case
```
/case case_id:123456789-1234567890-123
```

### Manage System
```
/moderation status
/moderation disable warn
/moderation reset
```

## 🆘 Support

For issues or questions:
1. Check console logs for error details
2. Verify database permissions and connectivity
3. Ensure bot has required Discord permissions
4. Check feature flag configuration

## 📄 License

This moderation system is part of the ServerMate Discord bot project.
