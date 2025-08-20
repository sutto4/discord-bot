-- Custom Commands Database Setup
-- Run this in your database to create the necessary tables

-- 1. Custom Commands Table
CREATE TABLE IF NOT EXISTS custom_commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    command_name VARCHAR(32) NOT NULL,
    command_prefix VARCHAR(10) DEFAULT '!',
    description TEXT,
    response_type ENUM('message', 'embed', 'dm') NOT NULL DEFAULT 'message',
    response_content TEXT,
    embed_data JSON,
    dm_content TEXT,
    channel_restrictions JSON, -- Array of channel IDs where command works
    role_restrictions JSON, -- Array of role IDs that can use command
    interactive_type ENUM('none', 'buttons', 'modal') DEFAULT 'none',
    interactive_data JSON, -- Button URLs, modal form fields, etc.
    variables_enabled BOOLEAN DEFAULT TRUE,
    cooldown_seconds INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(20) NOT NULL,
    usage_count INT DEFAULT 0,
    last_used TIMESTAMP NULL,
    
    INDEX idx_guild_id (guild_id),
    INDEX idx_command_name (command_name),
    INDEX idx_enabled (enabled),
    UNIQUE KEY unique_guild_command (guild_id, command_name)
);

-- 2. Custom Command Usage Logs
CREATE TABLE IF NOT EXISTS custom_command_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    command_id INT NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    username VARCHAR(32) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_sent BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    
    INDEX idx_guild_id (guild_id),
    INDEX idx_command_id (command_id),
    INDEX idx_user_id (user_id),
    INDEX idx_executed_at (executed_at),
    FOREIGN KEY (command_id) REFERENCES custom_commands(id) ON DELETE CASCADE
);

-- 3. Custom Command Variables (for future extensibility)
CREATE TABLE IF NOT EXISTS custom_command_variables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    variable_name VARCHAR(32) NOT NULL,
    variable_value TEXT,
    variable_type ENUM('static', 'dynamic', 'system') DEFAULT 'static',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_guild_id (guild_id),
    INDEX idx_variable_name (variable_name),
    UNIQUE KEY unique_guild_variable (guild_id, variable_name)
);
