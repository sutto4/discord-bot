-- Add discord_message_id column to embedded_message_channels table
-- This allows us to track the actual Discord message ID for each channel

ALTER TABLE embedded_message_channels 
ADD COLUMN discord_message_id VARCHAR(20) NULL AFTER channel_name;

-- Add index for faster lookups
CREATE INDEX idx_discord_message_id ON embedded_message_channels(discord_message_id);
