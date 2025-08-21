-- Setup for Creator Alerts Twitch-to-Discord mapping
-- This table maps Twitch usernames to Discord user IDs for role assignment

CREATE TABLE IF NOT EXISTS creator_alert_user_mapping (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guild_id VARCHAR(32) NOT NULL,
    twitch_username VARCHAR(255) NOT NULL,
    discord_user_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_guild_twitch (guild_id, twitch_username),
    KEY idx_guild (guild_id),
    KEY idx_twitch_username (twitch_username),
    KEY idx_discord_user (discord_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example usage:
-- INSERT INTO creator_alert_user_mapping (guild_id, twitch_username, discord_user_id) 
-- VALUES ('123456789012345678', 'shroud', '987654321098765432');

-- To get Discord user ID for a Twitch username in a specific guild:
-- SELECT discord_user_id FROM creator_alert_user_mapping 
-- WHERE guild_id = '123456789012345678' AND twitch_username = 'shroud';
