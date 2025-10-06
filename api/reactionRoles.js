const express = require('express');
const router = express.Router({ mergeParams: true });
const { appDb } = require('../config/database');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const client = require('../config/bot');

// In-memory map: messageId -> { id, username }
const createdByCache = new Map();

// In-memory storage for bot customisation (in production, this would be in a database)
const botCustomisationStore = new Map();

function isId(v) { return /^[0-9]{5,20}$/.test(String(v)); }

/**
 * Fetch bot customisation settings for a guild
 */
async function getBotCustomisation(guildId) {
  // For now, return from in-memory store
  // TODO: In production, fetch from database
  return botCustomisationStore.get(guildId) || { botName: null, botAvatarUrl: null };
}

/**
 * Temporarily change bot appearance and send message, then restore
 */
async function sendMessageWithCustomBot(channel, messageOptions, guildId) {
  const customSettings = await getBotCustomisation(guildId);
  let originalUsername = null;
  let originalAvatar = null;
  
  try {
    // Store original bot appearance
    originalUsername = client.user.username;
    originalAvatar = client.user.avatarURL();
    
    // Apply custom bot appearance if set
    if (customSettings.botName && customSettings.botName.trim()) {
      await client.user.setUsername(customSettings.botName.trim());
    }
    if (customSettings.botAvatarUrl && customSettings.botAvatarUrl.trim()) {
      await client.user.setAvatar(customSettings.botAvatarUrl.trim());
    }
    
    // Send the message
    const sent = await channel.send(messageOptions);
    
    return sent;
  } finally {
    // Always restore original bot appearance
    try {
      if (originalUsername && originalUsername !== client.user.username) {
        await client.user.setUsername(originalUsername);
      }
      if (originalAvatar && originalAvatar !== client.user.avatarURL()) {
        await client.user.setAvatar(originalAvatar);
      }
    } catch (restoreError) {
      console.error('Failed to restore bot appearance:', restoreError);
    }
  }
}

/**
 * Edit an existing message with custom bot appearance (same as send, but for editing)
 */
async function editMessageWithCustomBot(channel, messageId, messageOptions, guildId) {
  try {
    const message = await channel.messages.fetch(messageId);
    if (!message) throw new Error('Message not found');
    
    // Just edit the message directly (no need for bot appearance changes on edit)
    return await message.edit(messageOptions);
  } catch (error) {
    console.error('Failed to edit message:', error);
    throw error;
  }
}

/**
 * Resolve @username patterns in text to actual <@userId> mentions.
 * - Matches tokens like "@sutto" and tries to resolve by username or displayName.
 * - Limits to a small number of lookups to avoid abuse.
 * - Returns { text, userIds } where userIds should be passed to allowedMentions.users.
 */
async function resolveUserMentions(guild, text) {
  try {
    if (!text || typeof text !== 'string') return { text, userIds: [] };
    // Fetch members to ensure we can resolve names (requires GUILD_MEMBERS intent)
    try { await guild.members.fetch(); } catch {}
    const maxMentions = 10;
    const userIds = new Set();
    // Match @word with a safe character set; avoid already-formatted <@id>
    const re = /(^|[^<\w])@([A-Za-z0-9_.]{2,32})/g;
    const replaced = text.replace(re, (m, prefix, name) => {
      if (userIds.size >= maxMentions) return m;
      // Find by username or displayName (case-insensitive)
      const lower = String(name).toLowerCase();
      const member = guild.members.cache.find(
        (mem) =>
          mem.user?.username?.toLowerCase() === lower ||
          mem.displayName?.toLowerCase() === lower ||
          mem.user?.globalName?.toLowerCase?.() === lower
      );
      if (!member) return m;
      userIds.add(member.id);
      return `${prefix}<@${member.id}>`;
    });
    return { text: replaced, userIds: Array.from(userIds) };
  } catch { return { text, userIds: [] }; }
}

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
        title: embed?.title || embed?.data?.title || null,
        description: embed?.description || embed?.data?.description || null,
        color,
        thumbnailUrl: embed?.thumbnail?.url || embed?.data?.thumbnail?.url || null,
        imageUrl: embed?.image?.url || embed?.data?.image?.url || null,
        author: embed?.author || embed?.data?.author
          ? {
              name: (embed?.author?.name || embed?.data?.author?.name) || null,
              iconUrl: (embed?.author?.iconURL || embed?.data?.author?.icon_url) || null,
            }
          : null,
        footer: embed?.footer || embed?.data?.footer
          ? {
              text: (embed?.footer?.text || embed?.data?.footer?.text) || null,
              iconUrl: (embed?.footer?.iconURL || embed?.data?.footer?.icon_url) || null,
            }
          : null,
        timestamp: embed?.timestamp || embed?.data?.timestamp || null,
      },
      menu: { placeholder, minValues, maxValues },
      createdBy: createdByCache.get(String(messageId)) || null,
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
        createdBy: details?.createdBy || null,
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

// POST /guilds/:guildId/reaction-roles/publish-menu (create message + menu)
router.post('/publish-menu', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const {
      channelId,
      title,
      description,
      color,
      thumbnailUrl,
      imageUrl,
      author,
      footer,
      timestamp,
      roleIds,
      placeholder,
      minValues,
      maxValues,
    } = req.body || {};

    if (!isId(guildId) || !isId(channelId)) return res.status(400).json({ error: 'Invalid ids' });
    if (!Array.isArray(roleIds) || roleIds.length === 0) return res.status(400).json({ error: 'roleIds required' });

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(String(channelId));
    if (!channel || !channel.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });

    // Build embed
    const embed = new EmbedBuilder();
    let allowedMentions = undefined;
    if (title != null) embed.setTitle(String(title));
    if (description != null) {
      const { text, userIds } = await resolveUserMentions(guild, String(description));
      embed.setDescription(text);
      if (userIds.length > 0) allowedMentions = { parse: [], users: userIds };
    }
    if (color != null) embed.setColor(Number(color) || 0x5865F2);
    if (thumbnailUrl) embed.setThumbnail(String(thumbnailUrl));
    if (imageUrl) embed.setImage(String(imageUrl));
    if (author && (author.name || author.iconUrl)) {
      embed.setAuthor({ name: String(author.name || '\u200b'), iconURL: author.iconUrl ? String(author.iconUrl) : undefined });
    }
    if (footer && (footer.text || footer.iconUrl)) {
      embed.setFooter({ text: String(footer.text || '\u200b'), iconURL: footer.iconUrl ? String(footer.iconUrl) : undefined });
    }
    if (timestamp) {
      const ts = new Date(Number(timestamp));
      if (!isNaN(ts.getTime())) embed.setTimestamp(ts);
    }

    // Build select menu
    const options = [];
    for (const id of roleIds) {
      if (!isId(id)) continue;
      const role = await guild.roles.fetch(id).catch(() => null);
      if (!role) continue;
      options.push({ label: role.name, value: role.id });
    }
    if (options.length === 0) return res.status(400).json({ error: 'No valid roles' });

    const select = new StringSelectMenuBuilder()
      .setCustomId('rr_menu_new')
      .setPlaceholder(placeholder || 'Select roles')
      .setMinValues(Math.max(0, Math.min(options.length, Number(minValues ?? 0))))
      .setMaxValues(Math.max(1, Math.min(options.length, Number(maxValues ?? options.length))))
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(select);

    const sent = await sendMessageWithCustomBot(channel, { embeds: [embed], components: [row], ...(allowedMentions ? { allowedMentions } : {}) }, guildId);

    // Persist in DB
    await appDb.execute(
      `INSERT INTO reaction_role_messages (guild_id, channel_id, message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id), updated_at = CURRENT_TIMESTAMP`,
      [guildId, channelId, sent.id]
    );

    // Find internal id
    const [rows] = await appDb.execute(
      `SELECT id FROM reaction_role_messages WHERE guild_id = ? AND message_id = ? LIMIT 1`,
      [guildId, sent.id]
    );
    const msg = Array.isArray(rows) && rows[0];
    if (msg) {
      const placeholders3 = roleIds.map(() => '(?, ?, ?, ?)').join(',');
      const values3 = [];
      for (const rid of roleIds) values3.push(msg.id, null, null, rid);
      await appDb.execute(
        `INSERT INTO reaction_role_mappings (reaction_role_message_id, emoji, emoji_id, role_id) VALUES ${placeholders3}`,
        values3
      );

      // Update the Discord message with the correct customId now that we have the database ID
      const updatedSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_menu_${msg.id}`)
        .setPlaceholder(placeholder || 'Select roles')
        .setMinValues(Math.max(0, Math.min(options.length, Number(minValues ?? 0))))
        .setMaxValues(Math.max(1, Math.min(options.length, Number(maxValues ?? options.length))))
        .addOptions(options);
      const updatedRow = new ActionRowBuilder().addComponents(updatedSelect);

      await editMessageWithCustomBot(channel, sent.id, { embeds: [embed], components: [updatedRow] }, guildId);
    }

    // Cache createdBy for GET list
    const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null;
    const username = req.headers['x-user-name'] ? String(req.headers['x-user-name']) : null;
    if (userId || username) {
      createdByCache.set(String(sent.id), { id: userId, username });
    }

    return res.json({ ok: true, messageId: sent.id, createdBy: createdByCache.get(String(sent.id)) || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'publish_failed' });
  }
});

// POST /guilds/:guildId/reaction-roles/sync-bot-customisation
router.post('/sync-bot-customisation', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    if (!isId(guildId)) return res.status(400).json({ error: 'Invalid guild id' });

    const { botName, botAvatarUrl } = req.body || {};

    // Validate inputs
    if (botName && typeof botName === 'string' && botName.length > 32) {
      return res.status(400).json({ error: 'Bot name must be 32 characters or less' });
    }

    if (botAvatarUrl && typeof botAvatarUrl === 'string') {
      try {
        new URL(botAvatarUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid avatar URL format' });
      }
    }

    // Store the settings in memory (in production, this would be in a database)
    botCustomisationStore.set(guildId, {
      botName: botName || null,
      botAvatarUrl: botAvatarUrl || null
    });

    return res.json({ 
      success: true, 
      botName: botName || null, 
      botAvatarUrl: botAvatarUrl || null 
    });
  } catch (error) {
    console.error("Error syncing bot customisation:", error);
    return res.status(500).json({ error: "Failed to sync bot settings" });
  }
});

// GET /guilds/:guildId/reaction-roles/bot-customisation
router.get('/bot-customisation', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    if (!isId(guildId)) return res.status(400).json({ error: 'Invalid guild id' });

    const settings = await getBotCustomisation(guildId);
    return res.json(settings);
  } catch (error) {
    console.error("Error getting bot customisation:", error);
    return res.status(500).json({ error: "Failed to get bot settings" });
  }
});

// PATCH /guilds/:guildId/reaction-roles/:messageId (edit embed/menu/roles, enable/disable)
router.patch('/:messageId', async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const messageId = req.params.messageId;
    const { title, description, color, thumbnailUrl, imageUrl, roleIds, placeholder, minValues, maxValues, enabled, author, footer, timestamp } = req.body || {};
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
    let allowedMentions = undefined;
    if (title != null) embed.setTitle(String(title));
    if (description != null) {
      const { text, userIds } = await resolveUserMentions(guild, String(description));
      embed.setDescription(text);
      if (userIds.length > 0) allowedMentions = { parse: [], users: userIds };
    }
    if (color != null) embed.setColor(Number(color) || 0x5865F2);
    if (thumbnailUrl) embed.setThumbnail(String(thumbnailUrl));
    if (imageUrl) embed.setImage(String(imageUrl));
    if (author && (author.name || author.iconUrl)) {
      embed.setAuthor({ name: String(author.name || '\u200b'), iconURL: author.iconUrl ? String(author.iconUrl) : undefined });
    }
    if (footer && (footer.text || footer.iconUrl)) {
      embed.setFooter({ text: String(footer.text || '\u200b'), iconURL: footer.iconUrl ? String(footer.iconUrl) : undefined });
    }
    if (timestamp) {
      const ts = new Date(Number(timestamp));
      if (!isNaN(ts.getTime())) embed.setTimestamp(ts);
    }

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

    await discordMsg.edit({ embeds: [embed], components, ...(allowedMentions ? { allowedMentions } : {}) });
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
