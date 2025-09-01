-- Guild Commands Table
-- Stores individual command enable/disable states per guild
CREATE TABLE IF NOT EXISTS guild_commands (
    id int(11) NOT NULL AUTO_INCREMENT,
    guild_id varchar(255) NOT NULL,
    command_name varchar(255) NOT NULL,
    enabled tinyint(1) NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY guild_command (guild_id, command_name),
    KEY guild_id (guild_id),
    KEY command_name (command_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
