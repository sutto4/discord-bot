const express = require('express');
const router = express.Router({ mergeParams: true });
const { appDb } = require('../config/database');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const client = require('../config/bot');

function isId(v) { return /^[0-9]{5,20}$/.test(String(v)); }

async function fetchMessageDetails(guildId, channelId, messageId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return null;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return null;
    const embed = msg.embeds && msg.embeds[0] ? msg.embeds[0] : null;
    const compRow = (msg.components && msg.components[0]) ? msg.components[0] : null;
    const select = compRow && compRow.components && compRow.components[0] ? compRow.components[0] : null;
    const enabled = !!(select && !select.disabled);
    const placeholder = select?.placeholder || null;
    const minValues = typeof select?.minValues === 'number' ? select.minValues : null;
    const maxValues = typeof select?.maxValues === 'number' ? select.maxValues : null;
    const color = embed?.data?.color ?? null;
    return {
      enabled,
      embed: {
        title: embed?.title || null,
        description: embed?.description || null,
        color,
        thumbnailUrl: embed?.thumbnail?.url || null,
        imageUrl: embed?.image?.url || null,
      },
      menu: { placeholder, minValues, maxValues },
    };
  } catch { return null; }
}

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

    const out = [];
    for (const r of msgs) {
      const details = await fetchMessageDetails(guildId, String(r.channel_id), String(r.message_id));
      out.push({
        channelId: String(r.channel_id),
        messageId: String(r.message_id),
        mappings: idToMappings.get(r.id) || [],
        enabled: details?.enabled ?? null,
        embed: details?.embed ?? null,
        menu: details?.menu ?? null,
      });
    }
    res.json({ configs: out });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// POST /guilds/:guildId/reaction-roles (create/replace)
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
    const placeholders2 = [];
    for (const m of mappings) {
      if (!m || !m.emoji || !isId(m.roleId)) throw new Error('Invalid mapping');
      placeholders2.push('(?, ?, ?, ?)');
      values.push(msg.id, m.emoji || null, m.emoji_id || null, m.roleId);
    }
    await conn.execute(
      `INSERT INTO reaction_role_mappings (reaction_role_message_id, emoji, emoji_id, role_id)
       VALUES ${placeholders2.join(',')}`,
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

// PATCH /guilds/:guildId/reaction-roles/:messageId (edit embed/menu/roles, enable/disable)
router.patch('/:messageId', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const messageId = req.params.messageId;
    const { title, description, color, thumbnailUrl, imageUrl, roleIds, placeholder, minValues, maxValues, enabled } = req.body || {};
    if (!isId(guildId) || !isId(messageId)) return res.status(400).json({ error: 'Invalid ids' });

    // Look up internal id and channel
    const [rows] = await appDb.execute(
      `SELECT id, channel_id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
      [guildId, messageId]
    );
    const msg = Array.isArray(rows) && rows[0];
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(String(msg.channel_id));
    if (!channel || !channel.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
    const discordMsg = await channel.messages.fetch(messageId).catch(() => null);
    if (!discordMsg) return res.status(404).json({ error: 'Message not found' });

    // Build embed
    const embed = new EmbedBuilder();
    if (title != null) embed.setTitle(String(title));
    if (description != null) embed.setDescription(String(description));
    if (color != null) embed.setColor(Number(color) || 0x5865F2);
    if (thumbnailUrl) embed.setThumbnail(String(thumbnailUrl));
    if (imageUrl) embed.setImage(String(imageUrl));

    // Build select (if roleIds provided)
    let components = discordMsg.components;
    if (Array.isArray(roleIds)) {
      const options = [];
      for (const id of roleIds) {
        if (!isId(id)) continue;
        const role = await guild.roles.fetch(id).catch(() => null);
        if (!role) continue;
        options.push({ label: role.name, value: role.id });
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId(`rr_menu_${msg.id}`)
        .setPlaceholder(placeholder || 'Select roles')
        .setMinValues(Math.max(0, Math.min(options.length, Number(minValues ?? 0))))
        .setMaxValues(Math.max(1, Math.min(options.length, Number(maxValues ?? options.length))))
        .addOptions(options)
        .setDisabled(enabled === false);
      const row = new ActionRowBuilder().addComponents(select);
      components = [row];

      // Replace mappings in DB
      await appDb.execute(`DELETE FROM reaction_role_mappings WHERE reaction_role_message_id = ?`, [msg.id]);
      if (options.length > 0) {
        const placeholders3 = roleIds.map(() => '(?, ?, ?, ?)').join(',');
        const values3 = [];
        for (const rid of roleIds) values3.push(msg.id, null, null, rid);
        await appDb.execute(
          `INSERT INTO reaction_role_mappings (reaction_role_message_id, emoji, emoji_id, role_id) VALUES ${placeholders3}`,
          values3
        );
      }
    } else if (enabled === false || enabled === true) {
      // Toggle disabled state without changing roles
      const selectOld = discordMsg.components?.[0]?.components?.[0];
      if (selectOld && selectOld.customId?.startsWith('rr_menu_')) {
        const newSelect = new StringSelectMenuBuilder(selectOld.data || {})
          .setDisabled(enabled === false);
        const row = new ActionRowBuilder().addComponents(newSelect);
        components = [row];
      }
    }

    await discordMsg.edit({ embeds: [embed], components });
    res.json({ ok: true });
  } catch (e) {
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
      `SELECT id, channel_id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
      [guildId, messageId]
    );
    const msg = Array.isArray(rows) && rows[0];
    if (!msg) return res.status(404).json({ error: 'Not found' });

    // Try to delete the Discord message
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(String(msg.channel_id));
      if (channel && channel.isTextBased()) {
        const m = await channel.messages.fetch(messageId).catch(() => null);
        if (m) await m.delete().catch(() => {});
      }
    } catch {}

    await appDb.execute(`DELETE FROM reaction_role_mappings WHERE reaction_role_message_id = ?`, [msg.id]);
    await appDb.execute(`DELETE FROM reaction_role_messages WHERE id = ?`, [msg.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

module.exports = router;
