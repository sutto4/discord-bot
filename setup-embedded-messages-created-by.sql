-- Add created_by column to embedded_messages table
-- This allows us to track who created each embedded message

ALTER TABLE embedded_messages 
ADD COLUMN created_by VARCHAR(255) DEFAULT 'ServerMate Bot' AFTER enabled;

-- Update existing records to have a default creator
UPDATE embedded_messages SET created_by = 'ServerMate Bot' WHERE created_by IS NULL;
