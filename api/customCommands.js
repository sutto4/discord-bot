const express = require('express');
const { appDb } = require('../config/database');
const { GuildDatabase } = require('../config/database-multi-guild');

const router = express.Router();

// Get all custom commands for a guild
router.get('/', async (req, res) => {
  try {
    const { guildId } = req.params;
    
    // Check if guild exists and bot is in it
    const guild = await req.client.guilds.fetch(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const [commands] = await appDb.query(
      'SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY command_name',
      [guildId]
    );

    res.json(commands);
  } catch (error) {
    console.error('Error fetching custom commands:', error);
    res.status(500).json({ error: 'Failed to fetch custom commands' });
  }
});

// Get a specific custom command
router.get('/:commandId', async (req, res) => {
  try {
    const { guildId, commandId } = req.params;
    
    const [commands] = await appDb.query(
      'SELECT * FROM custom_commands WHERE id = ? AND guild_id = ?',
      [commandId, guildId]
    );

    if (commands.length === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    res.json(commands[0]);
  } catch (error) {
    console.error('Error fetching custom command:', error);
    res.status(500).json({ error: 'Failed to fetch custom command' });
  }
});

// Create a new custom command
router.post('/', async (req, res) => {
  try {
    const { guildId } = req.params;
    const {
      command_name,
      command_prefix = '!',
      description,
      response_type,
      response_content,
      embed_data,
      dm_content,
      channel_restrictions,
      role_restrictions,
      interactive_type = 'none',
      interactive_data,
      variables_enabled = true,
      cooldown_seconds = 0,
      created_by
    } = req.body;

    // Validate required fields
    if (!command_name || !response_type || !created_by) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if command name already exists for this guild
    const [existing] = await appDb.query(
      'SELECT id FROM custom_commands WHERE guild_id = ? AND command_name = ?',
      [guildId, command_name]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Command name already exists' });
    }

    // Insert the new command
    const [result] = await appDb.query(
      `INSERT INTO custom_commands (
        guild_id, command_name, command_prefix, description, response_type,
        response_content, embed_data, dm_content, channel_restrictions,
        role_restrictions, interactive_type, interactive_data, variables_enabled,
        cooldown_seconds, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        guildId, command_name, command_prefix, description, response_type,
        response_content, JSON.stringify(embed_data), dm_content, JSON.stringify(channel_restrictions),
        JSON.stringify(role_restrictions), interactive_type, JSON.stringify(interactive_data), variables_enabled,
        cooldown_seconds, created_by
      ]
    );

    // Fetch the created command
    const [commands] = await appDb.query(
      'SELECT * FROM custom_commands WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(commands[0]);
  } catch (error) {
    console.error('Error creating custom command:', error);
    res.status(500).json({ error: 'Failed to create custom command' });
  }
});

// Update a custom command
router.put('/:commandId', async (req, res) => {
  try {
    const { guildId, commandId } = req.params;
    const updateData = req.body;

    // Check if command exists and belongs to this guild
    const [existing] = await appDb.query(
      'SELECT id FROM custom_commands WHERE id = ? AND guild_id = ?',
      [commandId, guildId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      if (key !== 'id' && key !== 'guild_id') {
        fields.push(`${key} = ?`);
        if (key === 'embed_data' || key === 'channel_restrictions' || 
            key === 'role_restrictions' || key === 'interactive_data') {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(guildId, commandId);

    const [result] = await appDb.query(
      `UPDATE custom_commands SET ${fields.join(', ')} WHERE guild_id = ? AND id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Fetch the updated command
    const [commands] = await appDb.query(
      'SELECT * FROM custom_commands WHERE id = ?',
      [commandId]
    );

    res.json(commands[0]);
  } catch (error) {
    console.error('Error updating custom command:', error);
    res.status(500).json({ error: 'Failed to update custom command' });
  }
});

// Delete a custom command
router.delete('/:commandId', async (req, res) => {
  try {
    const { guildId, commandId } = req.params;

    const [result] = await appDb.query(
      'DELETE FROM custom_commands WHERE id = ? AND guild_id = ?',
      [commandId, guildId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom command:', error);
    res.status(500).json({ error: 'Failed to delete custom command' });
  }
});

// Toggle command enabled/disabled
router.patch('/:commandId/toggle', async (req, res) => {
  try {
    const { guildId, commandId } = req.params;

    const [result] = await appDb.query(
      'UPDATE custom_commands SET enabled = NOT enabled WHERE id = ? AND guild_id = ?',
      [commandId, guildId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Fetch the updated command
    const [commands] = await appDb.query(
      'SELECT * FROM custom_commands WHERE id = ?',
      [commandId]
    );

    res.json(commands[0]);
  } catch (error) {
    console.error('Error toggling custom command:', error);
    res.status(500).json({ error: 'Failed to toggle custom command' });
  }
});

// Get command usage statistics
router.get('/:commandId/stats', async (req, res) => {
  try {
    const { guildId, commandId } = req.params;

    const [logs] = await appDb.query(
      `SELECT 
        COUNT(*) as total_usage,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT DATE(executed_at)) as days_used,
        MAX(executed_at) as last_used
       FROM custom_command_logs 
       WHERE guild_id = ? AND command_id = ?`,
      [guildId, commandId]
    );

    res.json(logs[0]);
  } catch (error) {
    console.error('Error fetching command stats:', error);
    res.status(500).json({ error: 'Failed to fetch command stats' });
  }
});

module.exports = router;
