const express = require('express');
const router = express.Router({ mergeParams: true });
const { appDb } = require('../config/database');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const client = require('../config/bot');

function isId(v) { return /^[0-9]{5,20}$/.test(String(v)); }

// GET /guilds/:guildId/reaction-roles
router.get('/', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    if (!isId(guildId)) return res.status(400).json({ error: 'Invalid guild id' });

    const [msgs] = await appDb.execute(
      'SELECT id, channel_id, message_id FROM reaction_role_messages WHERE guild_id = ? ORDER BY updated_at DESC',
      [guildId]
    );
    if (!Array.isArray(msgs) || msgs.length === 0) return res.json({ configs: [] });

    const ids = msgs.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const [maps] = await appDb.query(
      `SELECT reaction_role_message_id, emoji, emoji_id, role_id
       FROM reaction_role_mappings
       WHERE reaction_role_message_id IN (${placeholders})`,
      ids
    );

    const idToMappings = new Map();
    for (const m of maps || []) {
      const arr = idToMappings.get(m.reaction_role_message_id) || [];
      arr.push({ emoji: m.emoji || '', emoji_id: m.emoji_id || null, roleId: String(m.role_id) });
      idToMappings.set(m.reaction_role_message_id, arr);
    }

    const configs = msgs.map(r => ({
      channelId: String(r.channel_id),
      messageId: String(r.message_id),
      mappings: idToMappings.get(r.id) || []
    }));
    res.json({ configs });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// POST /guilds/:guildId/reaction-roles
router.post('/', async (req, res) => {
  const conn = (typeof appDb.getConnection === 'function') ? await appDb.getConnection() : appDb;
  try {
    const guildId = req.params.guildId;
    const { channelId, messageId, mappings } = req.body || {};
    if (!isId(guildId) || !isId(channelId) || !isId(messageId)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: 'Mappings required' });
    }

    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO reaction_role_messages (guild_id, channel_id, message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), updated_at = CURRENT_TIMESTAMP`,
      [guildId, channelId, messageId]
    );

    const [rows] = await conn.execute(
      `SELECT id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
      [guildId, messageId]
    );
    const msg = Array.isArray(rows) && rows[0];
    if (!msg) throw new Error('Failed to upsert message');

    await conn.execute(
      `DELETE FROM reaction_role_mappings WHERE reaction_role_message_id = ?`,
      [msg.id]
    );

    const values = [];
    const placeholders = [];
    for (const m of mappings) {
      if (!m || !m.emoji || !isId(m.roleId)) throw new Error('Invalid mapping');
      placeholders.push('(?, ?, ?, ?)');
      values.push(msg.id, m.emoji || null, m.emoji_id || null, m.roleId);
    }
    await conn.execute(
      `INSERT INTO reaction_role_mappings (reaction_role_message_id, emoji, emoji_id, role_id)
       VALUES ${placeholders.join(',')}`,
      values
    );

    await conn.commit();
    if (conn.release) conn.release();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if (conn.release) conn.release();
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// DELETE /guilds/:guildId/reaction-roles/:messageId
router.delete('/:messageId', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const messageId = req.params.messageId;
    if (!isId(guildId) || !isId(messageId)) return res.status(400).json({ error: 'Invalid ids' });
    const [rows] = await appDb.execute(
      `SELECT id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
      [guildId, messageId]
    );
    const msg = Array.isArray(rows) && rows[0];
    if (!msg) return res.status(404).json({ error: 'Not found' });
    await appDb.execute(`DELETE FROM reaction_role_mappings WHERE reaction_role_message_id = ?`, [msg.id]);
    await appDb.execute(`DELETE FROM reaction_role_messages WHERE id = ?`, [msg.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// POST /guilds/:guildId/reaction-roles/publish-menu
router.post('/publish-menu', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const { channelId, title, description, color, thumbnailUrl, imageUrl, roleIds, placeholder, minValues, maxValues } = req.body || {};
    if (!isId(guildId) || !isId(channelId)) return res.status(400).json({ error: 'Invalid ids' });
    if (!Array.isArray(roleIds) || roleIds.length === 0) return res.status(400).json({ error: 'roleIds required' });

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });

    const embed = new EmbedBuilder();
    if (title) embed.setTitle(String(title));
    if (description) embed.setDescription(String(description));
    if (color) embed.setColor(Number(color) || 0x5865F2);
    if (thumbnailUrl) embed.setThumbnail(String(thumbnailUrl));
    if (imageUrl) embed.setImage(String(imageUrl));

    // Build a StringSelect with role options limited to provided roleIds
    const options = [];
    for (const id of roleIds) {
      if (!isId(id)) continue;
      const role = await guild.roles.fetch(id).catch(() => null);
      if (!role) continue;
      options.push({ label: role.name, value: role.id });
    }
    if (options.length === 0) return res.status(400).json({ error: 'No valid roles' });

    // Create DB stub message row to get internal id for customId
    await appDb.execute(
      `INSERT INTO reaction_role_messages (guild_id, channel_id, message_id) VALUES (?, ?, ?)`,
      [guildId, channelId, '0']
    );
    const [row2] = await appDb.execute(
      `SELECT id FROM reaction_role_messages WHERE guild_id=? AND channel_id=? ORDER BY id DESC LIMIT 1`,
      [guildId, channelId]
    );
    const msgRow = Array.isArray(row2) && row2[0];
    if (!msgRow) return res.status(500).json({ error: 'Failed to allocate message id' });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`rr_menu_${msgRow.id}`)
      .setPlaceholder(placeholder || 'Select roles')
      .setMinValues(Math.max(0, Math.min(options.length, Number(minValues || 0))))
      .setMaxValues(Math.max(1, Math.min(options.length, Number(maxValues || options.length))))
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(select);

    const sent = await channel.send({ embeds: [embed], components: [row] });

    // Update DB with real messageId and mappings
    await appDb.execute(
      `UPDATE reaction_role_messages SET message_id=? WHERE id=?`,
      [sent.id, msgRow.id]
    );
    // Replace mappings with selected roleIds (no emoji in menu mode)
    await appDb.execute(`DELETE FROM reaction_role_mappings WHERE reaction_role_message_id = ?`, [msgRow.id]);
    if (roleIds.length > 0) {
      const placeholders2 = roleIds.map(() => '(?, ?, ?, ?)').join(',');
      const values2 = [];
      for (const rid of roleIds) {
        values2.push(msgRow.id, null, null, rid);
      }
      await appDb.execute(
        `INSERT INTO reaction_role_mappings (reaction_role_message_id, emoji, emoji_id, role_id) VALUES ${placeholders2}`,
        values2
      );
    }

    res.json({ ok: true, channelId, messageId: sent.id, internalId: msgRow.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
