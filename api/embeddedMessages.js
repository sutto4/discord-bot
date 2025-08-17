const express = require('express');
const router = express.Router({ mergeParams: true });
const { appDb } = require('../config/database');
const { EmbedBuilder } = require('discord.js');
const client = require('../config/bot');

// In-memory map: messageId -> { id, username }
const createdByCache = new Map();

function isId(v) { return /^[0-9]{5,20}$/.test(String(v)); }

/**
 * Fetch embedded message configurations for a guild
 */
async function getEmbeddedMessageConfigs(guildId) {
  try {
    const [rows] = await appDb.query(
      "SELECT * FROM embedded_messages WHERE guild_id = ? ORDER BY created_at DESC",
      [guildId]
    );
    return rows;
  } catch (error) {
    console.error('Error fetching embedded message configs:', error);
    return [];
  }
}

/**
 * Create or update an embedded message configuration
 */
async function saveEmbeddedMessageConfig(guildId, config) {
  try {
    // Extract nested author and footer data from frontend format
    const authorName = config.author?.name || config.authorName;
    const authorIconUrl = config.author?.iconUrl || config.authorIconUrl;
    const footerText = config.footer?.text || config.footerText;
    const footerIconUrl = config.footer?.iconUrl || config.footerIconUrl;
    
    if (config.id && isId(config.id)) {
      // Update existing
      await appDb.query(
        `UPDATE embedded_messages SET 
          channel_id = ?, title = ?, description = ?, color = ?, 
          image_url = ?, thumbnail_url = ?, author_name = ?, author_icon_url = ?, 
          footer_text = ?, footer_icon_url = ?, timestamp = ?, enabled = ?, updated_at = NOW()
          WHERE id = ? AND guild_id = ?`,
        [
          config.channelId, config.title, config.description, config.color,
          config.imageUrl, config.thumbnailUrl, authorName, authorIconUrl,
          footerText, footerIconUrl, config.timestamp, config.enabled !== false ? 1 : 0,
          config.id, guildId
        ]
      );
      return config.id;
    } else {
      // Create new
      const [result] = await appDb.query(
        `INSERT INTO embedded_messages (
          guild_id, channel_id, title, description, color, 
          image_url, thumbnail_url, author_name, author_icon_url, 
          footer_text, footer_icon_url, timestamp, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          guildId, config.channelId, config.title, config.description, config.color,
          config.imageUrl, config.thumbnailUrl, authorName, authorIconUrl,
          footerText, footerIconUrl, config.timestamp, config.enabled !== false ? 1 : 0
        ]
      );
      return result.insertId;
    }
  } catch (error) {
    console.error('Error saving embedded message config:', error);
    throw error;
  }
}

/**
 * Delete an embedded message configuration
 */
async function deleteEmbeddedMessageConfig(guildId, configId) {
  try {
    await appDb.query(
      "DELETE FROM embedded_messages WHERE id = ? AND guild_id = ?",
      [configId, guildId]
    );
    return true;
  } catch (error) {
    console.error('Error deleting embedded message config:', error);
    throw error;
  }
}

/**
 * Toggle enabled status of an embedded message configuration
 */
async function toggleEmbeddedMessageConfig(guildId, configId, enabled) {
  try {
    await appDb.query(
      "UPDATE embedded_messages SET enabled = ?, updated_at = NOW() WHERE id = ? AND guild_id = ?",
      [enabled ? 1 : 0, configId, guildId]
    );
    return true;
  } catch (error) {
    console.error('Error toggling embedded message config:', error);
    throw error;
  }
}

/**
 * Send an embedded message to a channel
 */
async function sendEmbeddedMessage(guildId, config) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.channelId);
    
    if (!channel || !channel.isTextBased()) {
      throw new Error('Invalid channel or channel is not text-based');
    }

    const embed = new EmbedBuilder();
    
    if (config.title) embed.setTitle(config.title);
    if (config.description) embed.setDescription(config.description);
    if (config.color) embed.setColor(config.color);
    if (config.imageUrl) embed.setImage(config.imageUrl);
    if (config.thumbnailUrl) embed.setThumbnail(config.thumbnailUrl);
    
    // Handle both nested and flat author format
    const authorName = config.author?.name || config.authorName;
    const authorIconUrl = config.author?.iconUrl || config.authorIconUrl;
    if (authorName) {
      embed.setAuthor({
        name: authorName,
        iconURL: authorIconUrl || undefined
      });
    }
    
    // Handle both nested and flat footer format
    const footerText = config.footer?.text || config.footerText;
    const footerIconUrl = config.footer?.iconUrl || config.footerIconUrl;
    if (footerText) {
      embed.setFooter({
        text: footerText,
        iconURL: footerIconUrl || undefined
      });
    }
    
    if (config.timestamp) {
      embed.setTimestamp(config.timestamp);
    }

    const message = await channel.send({ embeds: [embed] });
    
    // Store who created this message
    createdByCache.set(message.id, { id: config.id, username: 'ServerMate Bot' });
    
    return message;
  } catch (error) {
    console.error('Error sending embedded message:', error);
    throw error;
  }
}

// GET /guilds/:guildId/embedded-messages
router.get('/', async (req, res) => {
  try {
    const { guildId } = req.params;
    
    if (!isId(guildId)) {
      return res.status(400).json({ error: 'Invalid guild ID' });
    }

    const configs = await getEmbeddedMessageConfigs(guildId);
    res.json({ configs });
  } catch (error) {
    console.error('GET /embedded-messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /guilds/:guildId/embedded-messages
router.post('/', async (req, res) => {
  try {
    const { guildId } = req.params;
    const config = req.body;
    
    if (!isId(guildId)) {
      return res.status(400).json({ error: 'Invalid guild ID' });
    }

    if (!config.channelId || !isId(config.channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }

    // Save the configuration
    const configId = await saveEmbeddedMessageConfig(guildId, config);
    
    // If enabled, send the message
    if (config.enabled) {
      try {
        await sendEmbeddedMessage(guildId, { ...config, id: configId });
        res.json({ 
          success: true, 
          id: configId, 
          message: 'Embedded message published successfully' 
        });
      } catch (sendError) {
        // Message saved but failed to send
        res.json({ 
          success: true, 
          id: configId, 
          warning: 'Configuration saved but failed to send message: ' + sendError.message 
        });
      }
    } else {
      res.json({ 
        success: true, 
        id: configId, 
        message: 'Configuration saved successfully' 
      });
    }
  } catch (error) {
    console.error('POST /embedded-messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /guilds/:guildId/embedded-messages/:id
router.put('/:id', async (req, res) => {
  try {
    const { guildId, id } = req.params;
    const config = req.body;
    
    if (!isId(guildId) || !isId(id)) {
      return res.status(400).json({ error: 'Invalid guild ID or config ID' });
    }

    config.id = id;
    const configId = await saveEmbeddedMessageConfig(guildId, config);
    
    res.json({ 
      success: true, 
      id: configId, 
      message: 'Configuration updated successfully' 
    });
  } catch (error) {
    console.error('PUT /embedded-messages/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /guilds/:guildId/embedded-messages/:id
router.delete('/:id', async (req, res) => {
  try {
    const { guildId, id } = req.params;
    
    if (!isId(guildId) || !isId(id)) {
      return res.status(400).json({ error: 'Invalid guild ID or config ID' });
    }

    await deleteEmbeddedMessageConfig(guildId, id);
    
    res.json({ 
      success: true, 
      message: 'Configuration deleted successfully' 
    });
  } catch (error) {
    console.error('DELETE /embedded-messages/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /guilds/:guildId/embedded-messages/:id
router.patch('/:id', async (req, res) => {
  try {
    const { guildId, id } = req.params;
    const { enabled } = req.body;
    
    if (!isId(guildId) || !isId(id)) {
      return res.status(400).json({ error: 'Invalid guild ID or config ID' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean' });
    }

    await toggleEmbeddedMessageConfig(guildId, id, enabled);
    
    res.json({ 
      success: true, 
      message: `Configuration ${enabled ? 'enabled' : 'disabled'} successfully` 
    });
  } catch (error) {
    console.error('PATCH /embedded-messages/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /guilds/:guildId/embedded-messages/:id/toggle (legacy)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { guildId, id } = req.params;
    const { enabled } = req.body;
    
    if (!isId(guildId) || !isId(id)) {
      return res.status(400).json({ error: 'Invalid guild ID or config ID' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean' });
    }

    await toggleEmbeddedMessageConfig(guildId, id, enabled);
    
    res.json({ 
      success: true, 
      message: `Configuration ${enabled ? 'enabled' : 'disabled'} successfully` 
    });
  } catch (error) {
    console.error('PATCH /embedded-messages/:id/toggle error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
