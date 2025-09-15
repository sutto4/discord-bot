-- Create table to track Twitch EventSub subscriptions
CREATE TABLE IF NOT EXISTS twitch_eventsub_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id VARCHAR(255) UNIQUE NOT NULL,
    broadcaster_user_id VARCHAR(255) NOT NULL,
    broadcaster_name VARCHAR(100) NOT NULL,
    event_type ENUM('stream.online', 'stream.offline') NOT NULL,
    status ENUM('enabled', 'webhook_callback_verification_pending', 'webhook_callback_verification_failed', 'notification_failures_exceeded', 'authorization_revoked', 'user_removed') DEFAULT 'enabled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_broadcaster_user_id (broadcaster_user_id),
    INDEX idx_broadcaster_name (broadcaster_name),
    INDEX idx_event_type (event_type),
    INDEX idx_status (status)
);
