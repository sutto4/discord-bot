-- Add message_id column to embedded_messages table
-- This allows us to store the actual Discord message ID for deletion

ALTER TABLE embedded_messages 
ADD COLUMN message_id VARCHAR(20) NULL AFTER channel_id;

-- Add index for faster lookups
CREATE INDEX idx_embedded_messages_message_id ON embedded_messages(message_id);
