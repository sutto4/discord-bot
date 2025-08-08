-- Discord Bot Multi-Server Database Schema
-- This supports multiple Discord servers in one database

-- Guild (Discord Server) configuration table
CREATE TABLE guilds (
    guild_id VARCHAR(20) PRIMARY KEY,
    guild_name VARCHAR(100),
    verify_channel_id VARCHAR(20),
    feedback_channel_id VARCHAR(20),
    verify_role_id VARCHAR(20),
    tier1_role_id VARCHAR(20),
    tier2_role_id VARCHAR(20),
    tier3_role_id VARCHAR(20),
    tebex_secret VARCHAR(255),
    sync_interval INT DEFAULT 720,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User verification tracking (per guild)
CREATE TABLE user_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    username VARCHAR(100),
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_guild (guild_id, user_id)
);

-- Feedback submissions (per guild)
CREATE TABLE feedback_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    username VARCHAR(100),
    feedback_type VARCHAR(50),
    subject VARCHAR(100),
    details TEXT,
    contact_info VARCHAR(100),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Donator role sync tracking (per guild)
CREATE TABLE donator_syncs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20),
    user_id VARCHAR(20),
    tebex_user_id VARCHAR(50),
    username VARCHAR(100),
    tier_level INT,
    role_assigned VARCHAR(20),
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
    UNIQUE KEY unique_tebex_guild (guild_id, tebex_user_id)
);

-- Sync job logs (per guild)
CREATE TABLE sync_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20),
    sync_started TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_completed TIMESTAMP NULL,
    users_processed INT DEFAULT 0,
    roles_assigned INT DEFAULT 0,
    errors INT DEFAULT 0,
    status ENUM('running', 'completed', 'failed') DEFAULT 'running',
    error_message TEXT NULL,
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_user_verifications_guild_user ON user_verifications(guild_id, user_id);
CREATE INDEX idx_feedback_guild_date ON feedback_submissions(guild_id, submitted_at);
CREATE INDEX idx_donator_syncs_guild_user ON donator_syncs(guild_id, user_id);
CREATE INDEX idx_sync_logs_guild_date ON sync_logs(guild_id, sync_started);
