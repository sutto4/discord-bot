const express = require('express');
const router = express.Router({ mergeParams: true });
const { appDb } = require('../config/database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = require('../config/bot');

// In-memory map: messageId -> { id, username }
const createdByCache = new Map();

function isId(v) { return /^[0-9]{1,20}$/.test(String(v)); }

/**
 * Build an embed from configuration
 */
function buildEmbed(config) {
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
  
  return embed;
}

/**
 * Build action row with buttons for Discord embed
 */
function buildActionRow(config) {
  if (!config.enableButtons || !config.buttons || config.buttons.length === 0) {
    return null;
  }
  

  const actionRow = new ActionRowBuilder();
  
  config.buttons.forEach(button => {
    const buttonBuilder = new ButtonBuilder()
      .setLabel(button.label)
      .setURL(button.url)
      .setStyle(
        button.style === 'primary' ? ButtonStyle.Primary :
        button.style === 'secondary' ? ButtonStyle.Secondary :
        button.style === 'danger' ? ButtonStyle.Danger :
        ButtonStyle.Link
      );
    
    actionRow.addComponents(buttonBuilder);
  });
  
  return actionRow;
}

/**
 * Fetch embedded message configurations for a guild
 */
async function getEmbeddedMessageConfigs(guildId) {
  try {
    // Use JOIN to fetch all data in one query for better performance
    const [rows] = await appDb.query(`
      SELECT 
        em.*,
        emc.guild_id as channel_guild_id,
        emc.channel_id as channel_channel_id,
        emc.guild_name as channel_guild_name,
        emc.channel_name as channel_channel_name
      FROM embedded_messages em
      LEFT JOIN embedded_message_channels emc ON em.id = emc.message_id
      WHERE em.guild_id = ?
      ORDER BY em.created_at DESC, emc.channel_id
    `, [guildId]);
    
    // Group by message ID to handle multi-channel messages
    const messageMap = new Map();
    
    rows.forEach(row => {
      const messageId = row.id;
      
      if (!messageMap.has(messageId)) {
        // Create base message object
        const baseMessage = {
          id: row.id,
          channelId: row.channel_id, // Keep for backward compatibility
          messageId: row.message_id,
          title: row.title,
          description: row.description,
          color: row.color,
          imageUrl: row.image_url,
          thumbnailUrl: row.thumbnail_url,
          author: row.author_name || row.author_icon_url ? {
            name: row.author_name,
            iconUrl: row.author_icon_url
          } : null,
          footer: row.footer_text || row.footer_icon_url ? {
            text: row.footer_text,
            iconUrl: row.footer_icon_url
          } : null,
          timestamp: row.timestamp,
          enabled: row.enabled === 1,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          multiChannel: row.multi_channel === 1,
          enableButtons: row.enable_buttons === 1,
          buttons: row.buttons ? JSON.parse(row.buttons) : [],
          channels: []
        };
        
        messageMap.set(messageId, baseMessage);
      }
      
      // Add channel information if this is a multi-channel message
      if (row.multi_channel === 1 && row.channel_guild_id) {
        const message = messageMap.get(messageId);
        message.channels.push({
          guildId: row.channel_guild_id,
          channelId: row.channel_channel_id,
          guildName: row.channel_guild_name,
          channelName: row.channel_channel_name
        });
      }
    });
    
    return Array.from(messageMap.values());
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
    
    // Check if this is a multi-channel message
    const isMultiChannel = config.channels && config.channels.length > 1;
    
    if (config.id && isId(config.id)) {
      // Update existing
      await appDb.query(
        `UPDATE embedded_messages SET 
          channel_id = ?, message_id = ?, title = ?, description = ?, color = ?, 
          image_url = ?, thumbnail_url = ?, author_name = ?, author_icon_url = ?, 
          footer_text = ?, footer_icon_url = ?, timestamp = ?, enabled = ?, multi_channel = ?, 
          enable_buttons = ?, buttons = ?, updated_at = NOW()
          WHERE id = ? AND guild_id = ?`,
        [
          config.channelId, config.messageId, config.title, config.description, config.color,
          config.imageUrl, config.thumbnailUrl, authorName, authorIconUrl,
          footerText, footerIconUrl, config.timestamp, config.enabled !== false ? 1 : 0,
          isMultiChannel ? 1 : 0, config.enableButtons ? 1 : 0, 
          config.buttons ? JSON.stringify(config.buttons) : null, config.id, guildId
        ]
      );
      
      // If multi-channel, update the channels table
      if (isMultiChannel) {
        // Get existing Discord message IDs before clearing
        const [existingChannels] = await appDb.query(
          "SELECT channel_id, discord_message_id FROM embedded_message_channels WHERE message_id = ?",
          [config.id]
        );
        
        const existingMessageIds = new Map(
          existingChannels.map(ch => [ch.channel_id, ch.discord_message_id])
        );
        
        // Clear existing channels
        await appDb.query("DELETE FROM embedded_message_channels WHERE message_id = ?", [config.id]);
        
        // Batch insert new channels, preserving existing Discord message IDs
        if (config.channels.length > 0) {
          const values = config.channels.map(channel => {
            const existingDiscordMessageId = existingMessageIds.get(channel.channelId) || null;
            return [config.id, channel.guildId, channel.channelId, channel.guildName, channel.channelName, existingDiscordMessageId];
          });
          
          const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          await appDb.query(
            `INSERT INTO embedded_message_channels (message_id, guild_id, channel_id, guild_name, channel_name, discord_message_id) VALUES ${placeholders}`,
            values.flat()
          );
        }
      }
      
      return config.id;
    } else {
      // Create new
      const [result] = await appDb.query(
        `INSERT INTO embedded_messages (
          guild_id, channel_id, message_id, title, description, color, 
          image_url, thumbnail_url, author_name, author_icon_url, 
          footer_text, footer_icon_url, timestamp, enabled, multi_channel, 
          enable_buttons, buttons, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          guildId, config.channelId, config.messageId, config.title, config.description, config.color,
          config.imageUrl, config.thumbnailUrl, authorName, authorIconUrl,
          footerText, footerIconUrl, config.timestamp, config.enabled !== false ? 1 : 0,
          isMultiChannel ? 1 : 0, config.enableButtons ? 1 : 0, 
          config.buttons ? JSON.stringify(config.buttons) : null, config.createdBy || 'ServerMate Bot'
        ]
      );
      
      const configId = result.insertId;
      
      // If multi-channel, insert into channels table
      if (isMultiChannel) {
        if (config.channels.length > 0) {
          const values = config.channels.map(channel => [
            configId, channel.guildId, channel.channelId, channel.guildName, channel.channelName, null
          ]);
          
          const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
          await appDb.query(
            `INSERT INTO embedded_message_channels (message_id, guild_id, channel_id, guild_name, channel_name, discord_message_id) VALUES ${placeholders}`,
            values.flat()
          );
        }
      }
      
      return configId;
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

    const embed = buildEmbed(config);
    const actionRow = buildActionRow(config);
    
    const messageOptions = { embeds: [embed] };
    if (actionRow) {
      messageOptions.components = [actionRow];
    }
    
    const message = await channel.send(messageOptions);
    
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

    // Save the configuration first (without message_id)
    const configId = await saveEmbeddedMessageConfig(guildId, config);
    
    // If enabled, send the message to all channels
    if (config.enabled) {
      try {
        let sentMessages = [];
        
        if (config.channels && config.channels.length > 1) {
          // Multi-channel message - send to all channels in parallel
          const channelPromises = config.channels.map(async (channel) => {
            try {
              const sentMessage = await sendEmbeddedMessage(channel.guildId, { ...config, id: configId, channelId: channel.channelId });
              
              return {
                guildId: channel.guildId,
                channelId: channel.channelId,
                messageId: sentMessage.id
              };
            } catch (channelError) {
              console.error(`Failed to send to channel ${channel.channelId}:`, channelError.message);
              return null;
            }
          });
          
          // Wait for all channels to be processed
          const results = await Promise.all(channelPromises);
          sentMessages = results.filter(result => result !== null);
          
          // Batch update all discord_message_id values
          if (sentMessages.length > 0) {
            const updatePromises = sentMessages.map(msg => 
              appDb.query(
                "UPDATE embedded_message_channels SET discord_message_id = ? WHERE message_id = ? AND channel_id = ?",
                [msg.messageId, configId, msg.channelId]
              )
            );
            await Promise.all(updatePromises);
          }
        } else {
          // Single-channel message
          const sentMessage = await sendEmbeddedMessage(guildId, { ...config, id: configId });
          
          // Update the discord_message_id in the channels table if this is a multi-channel message
          if (config.channels && config.channels.length > 1) {
            await appDb.query(
              "UPDATE embedded_message_channels SET discord_message_id = ? WHERE message_id = ? AND channel_id = ?",
              [sentMessage.id, configId, config.channelId]
            );
          }
          
          sentMessages.push({
            guildId: guildId,
            channelId: config.channelId,
            messageId: sentMessage.id
          });
        }
        
        if (sentMessages.length > 0) {
          // Update the configuration with the first Discord message ID for backward compatibility
          await appDb.query(
            `UPDATE embedded_messages SET message_id = ? WHERE id = ? AND guild_id = ?`,
            [sentMessages[0].messageId, configId, guildId]
          );
          
          res.json({ 
            success: true, 
            id: configId, 
            messageId: sentMessages[0].messageId,
            message: `Embedded message published to ${sentMessages.length} channel${sentMessages.length > 1 ? 's' : ''}`,
            sentMessages: sentMessages
          });
        } else {
          res.json({ 
            success: true, 
            id: configId, 
            warning: 'Configuration saved but failed to send to any channels' 
          });
        }
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

    // Get existing config to check if we need to delete old message
    const [existingRows] = await appDb.query(
      `SELECT message_id, channel_id FROM embedded_messages WHERE id = ? AND guild_id = ? LIMIT 1`,
      [id, guildId]
    );
    
    const existingConfig = Array.isArray(existingRows) && existingRows[0];
    
    // For multi-channel messages, we need to handle editing differently
    if (config.enabled && existingConfig && existingConfig.message_id) {
      if (config.channels && config.channels.length > 1) {
        // Multi-channel message - we'll edit existing messages if possible, or send new ones
      } else {
        // Single-channel message - delete old message to replace with new one
        try {
          const guild = await client.guilds.fetch(guildId);
          const channel = await guild.channels.fetch(String(existingConfig.channel_id));
          if (channel && channel.isTextBased()) {
            const oldMessage = await channel.messages.fetch(existingConfig.message_id).catch(() => null);
            if (oldMessage) {
              await oldMessage.delete().catch(() => {});
            }
          }
        } catch (discordError) {
          // Continue with database deletion even if Discord deletion fails
        }
      }
    }

    config.id = id;
    const configId = await saveEmbeddedMessageConfig(guildId, config);
    
    // If enabled, send new message to all channels and update message_id
    if (config.enabled) {
      try {
        let sentMessages = [];
        
        if (config.channels && config.channels.length > 1) {
          // Multi-channel message - try to edit existing messages or send new ones
          // Batch fetch all existing channel data first
          const [allExistingChannels] = await appDb.query(
            "SELECT channel_id, discord_message_id FROM embedded_message_channels WHERE message_id = ?",
            [configId]
          );
          
          const existingChannelMap = new Map(
            allExistingChannels.map(ch => [ch.channel_id, ch.discord_message_id])
          );
          
          // Process channels in parallel for better performance
          const channelPromises = config.channels.map(async (channel) => {
            try {
              const existingDiscordMessageId = existingChannelMap.get(channel.channelId);
              
              if (existingDiscordMessageId) {
                // Try to edit existing message
                try {
                  const guild = await client.guilds.fetch(channel.guildId);
                  const discordChannel = await guild.channels.fetch(channel.channelId);
                  if (discordChannel && discordChannel.isTextBased()) {
                    const existingMessage = await discordChannel.messages.fetch(existingDiscordMessageId).catch(() => null);
                    if (existingMessage) {
                      // Edit the existing message
                      const embed = buildEmbed(config);
                      const actionRow = buildActionRow(config);
                      
                      const editOptions = { embeds: [embed] };
                      if (actionRow) {
                        editOptions.components = [actionRow];
                      }
                      
                      await existingMessage.edit(editOptions);
                      
                      return {
                        guildId: channel.guildId,
                        channelId: channel.channelId,
                        messageId: existingDiscordMessageId,
                        edited: true
                      };
                    }
                  }
                } catch (editError) {
                  // Continue with sending new message if editing fails
                }
              }
              
              // Send new message if editing failed or no existing message
              const sentMessage = await sendEmbeddedMessage(channel.guildId, { ...config, id: configId, channelId: channel.channelId });
              
              return {
                guildId: channel.guildId,
                channelId: channel.channelId,
                messageId: sentMessage.id,
                edited: false
              };
            } catch (channelError) {
              console.error(`Failed to send to channel ${channel.channelId}:`, channelError.message);
              return null;
            }
          });
          
          // Wait for all channels to be processed
          const results = await Promise.all(channelPromises);
          sentMessages = results.filter(result => result !== null);
          
          // Batch update all discord_message_id values
          if (sentMessages.length > 0) {
            const updatePromises = sentMessages.map(msg => 
              appDb.query(
                "UPDATE embedded_message_channels SET discord_message_id = ? WHERE message_id = ? AND channel_id = ?",
                [msg.messageId, configId, msg.channelId]
              )
            );
            await Promise.all(updatePromises);
          }
        } else {
          // Single-channel message
          const sentMessage = await sendEmbeddedMessage(guildId, { ...config, id: configId });
          sentMessages.push({
            guildId: guildId,
            channelId: config.channelId,
            messageId: sentMessage.id
          });
        }
        
        if (sentMessages.length > 0) {
          // Update the configuration with the first Discord message ID for backward compatibility
          await appDb.query(
            `UPDATE embedded_messages SET message_id = ? WHERE id = ? AND guild_id = ?`,
            [sentMessages[0].messageId, configId, guildId]
          );
          
          const editedCount = sentMessages.filter(m => m.edited).length;
          const newCount = sentMessages.filter(m => !m.edited).length;
          
          let messageText = `Configuration updated successfully! `;
          if (editedCount > 0) {
            messageText += `Edited ${editedCount} existing message${editedCount > 1 ? 's' : ''}`;
          }
          if (newCount > 0) {
            if (editedCount > 0) messageText += ` and `;
            messageText += `sent ${newCount} new message${newCount > 1 ? 's' : ''}`;
          }
          messageText += ` to ${sentMessages.length} channel${sentMessages.length > 1 ? 's' : ''}`;
          
          res.json({ 
            success: true, 
            id: configId, 
            messageId: sentMessages[0].messageId,
            message: messageText,
            sentMessages: sentMessages
          });
        } else {
          res.json({ 
            success: true, 
            id: configId, 
            warning: 'Configuration updated but failed to send to any channels' 
          });
        }
      } catch (sendError) {
        res.json({ 
          success: true, 
          id: configId, 
          warning: 'Configuration updated but failed to send new message: ' + sendError.message 
        });
      }
    } else {
      // If disabled, clear the message_id
      await appDb.query(
        `UPDATE embedded_messages SET message_id = NULL WHERE id = ? AND guild_id = ?`,
        [configId, guildId]
      );
      
      res.json({ 
        success: true, 
        id: configId, 
        message: 'Configuration updated successfully' 
      });
    }
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

    // Get the message details before deleting
    const [rows] = await appDb.query(
      `SELECT id, channel_id, message_id FROM embedded_messages WHERE id = ? AND guild_id = ? LIMIT 1`,
      [id, guildId]
    );
    
    const config = Array.isArray(rows) && rows[0];
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    // Try to delete the Discord message if we have the message_id
    if (config.message_id) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(String(config.channel_id));
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(config.message_id).catch(() => null);
          if (message) {
            await message.delete().catch(() => {});
          }
        }
      } catch (discordError) {
        // Continue with database deletion even if Discord deletion fails
      }
    }

    // Delete from database (this will cascade to embedded_message_channels due to foreign key)
    await deleteEmbeddedMessageConfig(guildId, id);
    
    res.json({ 
      success: true, 
      message: 'Configuration and Discord message deleted successfully' 
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

    // Get existing config to check if we need to delete message
    const [existingRows] = await appDb.query(
      `SELECT message_id, channel_id FROM embedded_messages WHERE id = ? AND guild_id = ? LIMIT 1`,
      [id, guildId]
    );
    
    const existingConfig = Array.isArray(existingRows) && existingRows[0];
    
    // If disabling and we have a message, delete it
    if (!enabled && existingConfig && existingConfig.message_id) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(String(existingConfig.channel_id));
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(existingConfig.message_id).catch(() => null);
          if (message) {
            await message.delete().catch(() => {});
          }
        }
      } catch (discordError) {
        // Continue with database deletion even if Discord deletion fails
      }
    }

    await toggleEmbeddedMessageConfig(guildId, id, enabled);
    
    // Update message_id based on enabled status
    if (enabled) {
      // Clear message_id when enabling (will be set when message is actually sent)
      await appDb.query(
        `UPDATE embedded_messages SET message_id = NULL WHERE id = ? AND guild_id = ?`,
        [id, guildId]
      );
    } else {
      // Clear message_id when disabling
      await appDb.query(
        `UPDATE embedded_messages SET message_id = NULL WHERE id = ? AND guild_id = ?`,
        [id, guildId]
      );
    }
    
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

    // Get existing config to check if we need to delete message
    const [existingRows] = await appDb.query(
      `SELECT message_id, channel_id FROM embedded_messages WHERE id = ? AND guild_id = ? LIMIT 1`,
      [id, guildId]
    );
    
    const existingConfig = Array.isArray(existingRows) && existingRows[0];
    
    // If disabling and we have a message, delete it
    if (!enabled && existingConfig && existingConfig.message_id) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(String(existingConfig.channel_id));
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(existingConfig.message_id).catch(() => null);
          if (message) {
            await message.delete().catch(() => {});
          }
        }
      } catch (discordError) {
        // Continue with database deletion even if Discord deletion fails
      }
    }

    await toggleEmbeddedMessageConfig(guildId, id, enabled);
    
    // Update message_id based on enabled status
    if (enabled) {
      // Clear message_id when enabling (will be set when message is actually sent)
      await appDb.query(
        `UPDATE embedded_messages SET message_id = NULL WHERE id = ? AND guild_id = ?`,
        [id, guildId]
      );
    } else {
      // Clear message_id when disabling
      await appDb.query(
        `UPDATE embedded_messages SET message_id = NULL WHERE id = ? AND guild_id = ?`,
        [id, guildId]
      );
    }
    
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
