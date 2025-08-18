-- Setup feedback_submissions table for Discord bot feedback system
-- Run this SQL to create the required table structure

CREATE TABLE IF NOT EXISTS `feedback_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `guild_id` varchar(20) NOT NULL,
  `user_id` varchar(20) NOT NULL,
  `username` varchar(255) NOT NULL,
  `feedback_type` varchar(50) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `details` text NOT NULL,
  `contact_info` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `guild_id` (`guild_id`),
  KEY `user_id` (`user_id`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: Add indexes for better performance on large datasets
-- CREATE INDEX idx_feedback_guild_type ON feedback_submissions(guild_id, feedback_type);
-- CREATE INDEX idx_feedback_created_at ON feedback_submissions(created_at);
