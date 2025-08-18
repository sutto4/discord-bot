# Discord Bot Feedback System

This Discord bot includes a comprehensive feedback system that allows users to submit feedback, bug reports, support requests, and suggestions.

## Features

### Commands
- **`/support`** - Opens a feedback modal for support requests and issues
- **`/feedback`** - Opens a feedback modal for general feedback and suggestions
- **`/setfeedbackchannel`** - Admin command to set where feedback is logged
- **`.feedback`** - Dot command alternative that creates a feedback button

### Feedback Types
Users can submit various types of feedback:
- Bug Reports
- Feature Suggestions
- Support Requests
- Compliments
- General Feedback
- Server Improvements

## Setup

### 1. Database Setup
Run the SQL script to create the required table:
```sql
-- Run this in your MySQL database
source setup-feedback-table.sql
```

### 2. Configure Feedback Channel
Use the `/setfeedbackchannel` command to specify where feedback submissions will be sent:
```
/setfeedbackchannel #feedback-channel
```

### 3. Deploy Commands
After adding the new commands, redeploy them:
```bash
node deploy-commands.js
```

## How It Works

### User Experience
1. User types `/support` or `/feedback`
2. A modal opens with fields for:
   - Feedback Type (required)
   - Subject (required)
   - Details (required)
   - Contact Info (optional)
3. User submits the form
4. Feedback is logged to the configured channel
5. User receives confirmation

### Feedback Flow
1. **Submission** → User submits via modal
2. **Processing** → Bot creates embed with submission details
3. **Logging** → Feedback sent to configured channel
4. **Database** → Entry saved to `feedback_submissions` table
5. **Confirmation** → User receives success message

### Automatic Integration
- **Verification Completion** - Users see feedback button after verification
- **Button Interactions** - Existing feedback buttons continue to work
- **Fallback Logging** - If no feedback channel set, logs to verification channel

## Configuration

### Feedback Channel
- Set with `/setfeedbackchannel #channel`
- Stored in `data/feedback_channels.json`
- Per-guild configuration

### Database Logging
- All submissions logged to `feedback_submissions` table
- Includes user info, timestamp, and full submission details
- Accessible via admin commands for analytics

## Admin Commands

### `/setfeedbackchannel`
Sets the channel where feedback submissions will be sent.

**Usage:**
```
/setfeedbackchannel #feedback-channel
```

**Permissions:** Administrator

### `/config`
Shows current bot configuration including feedback channel status.

## Database Schema

```sql
CREATE TABLE feedback_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  username VARCHAR(255) NOT NULL,
  feedback_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  details TEXT NOT NULL,
  contact_info VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(guild_id),
  INDEX(user_id),
  INDEX(created_at)
);
```

## Troubleshooting

### Common Issues

1. **Feedback not being sent**
   - Check if feedback channel is configured
   - Verify bot has permissions in the channel
   - Check bot logs for errors

2. **Commands not working**
   - Ensure commands are deployed with `deploy-commands.js`
   - Check bot has proper permissions
   - Verify command files are in the correct directory

3. **Database errors**
   - Ensure `feedback_submissions` table exists
   - Check database connection
   - Verify table schema matches expected structure

### Logs
Check the bot console for:
- Feedback submission confirmations
- Database operation results
- Error messages for debugging

## Customization

### Modal Fields
Edit the command files to modify:
- Field labels and placeholders
- Required/optional fields
- Maximum character limits
- Modal titles

### Embed Styling
Customize the feedback embed appearance in `interactionCreate.js`:
- Colors
- Field layouts
- Thumbnails and timestamps

### Channel Configuration
The feedback system supports:
- Multiple guilds with different channels
- Fallback to verification channels
- Easy channel switching via commands
