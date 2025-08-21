-- Add discord_user_id column to creator_alert_rules table
ALTER TABLE creator_alert_rules 
ADD COLUMN discord_user_id VARCHAR(32) NULL AFTER channel_id;

-- Add index for better performance
ALTER TABLE creator_alert_rules 
ADD INDEX idx_discord_user (discord_user_id);

-- Verify the table structure
DESCRIBE creator_alert_rules;
