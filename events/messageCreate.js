const { appDb } = require('../config/database');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    try {
      // Handle sticky messages
      await handleStickyMessage(message, client);
      // Check if the message starts with a known command prefix
      const content = message.content.trim();
      if (!content || content.length < 2) return;

      // Get all custom commands for this guild
      const [commands] = await appDb.query(
        'SELECT * FROM custom_commands WHERE guild_id = ? AND enabled = ?',
        [message.guild.id, true]
      );

      if (commands.length === 0) return;

      // Find matching command
      let matchedCommand = null;
      for (const command of commands) {
        if (content.startsWith(command.command_prefix + command.command_name)) {
          // Check if it's a complete command (followed by space or end of message)
          const commandText = command.command_prefix + command.command_name;
          if (content === commandText || content.startsWith(commandText + ' ')) {
            matchedCommand = command;
            break;
          }
        }
      }

      if (!matchedCommand) return;

      // Check cooldown
      if (matchedCommand.cooldown_seconds > 0) {
        const [cooldownCheck] = await appDb.query(
          'SELECT executed_at FROM custom_command_logs WHERE guild_id = ? AND command_id = ? AND user_id = ? ORDER BY executed_at DESC LIMIT 1',
          [message.guild.id, matchedCommand.id, message.author.id]
        );

        if (cooldownCheck.length > 0) {
          const lastUsed = new Date(cooldownCheck[0].executed_at);
          const now = new Date();
          const timeDiff = (now - lastUsed) / 1000; // seconds

          if (timeDiff < matchedCommand.cooldown_seconds) {
            const remaining = Math.ceil(matchedCommand.cooldown_seconds - timeDiff);
            await message.reply(`⏰ This command is on cooldown. Please wait ${remaining} more second(s).`);
            return;
          }
        }
      }

      // Check channel restrictions
      if (matchedCommand.channel_restrictions && matchedCommand.channel_restrictions.length > 0) {
        const channelRestrictions = JSON.parse(matchedCommand.channel_restrictions);
        if (!channelRestrictions.includes(message.channel.id)) {
          await message.reply('❌ This command cannot be used in this channel.');
          return;
        }
      }

      // Check role restrictions
      if (matchedCommand.role_restrictions && matchedCommand.role_restrictions.length > 0) {
        const roleRestrictions = JSON.parse(matchedCommand.role_restrictions);
        const memberRoles = message.member.roles.cache.map(role => role.id);
        const hasRequiredRole = roleRestrictions.some(roleId => memberRoles.includes(roleId));
        
        if (!hasRequiredRole) {
          await message.reply('❌ You do not have permission to use this command.');
          return;
        }
      }

      // Process variables if enabled
      let processedContent = '';
      if (matchedCommand.variables_enabled) {
        processedContent = processVariables(matchedCommand, message);
      }

      // Execute the command based on response type
      let responseSent = false;
      try {
        switch (matchedCommand.response_type) {
          case 'message':
            if (matchedCommand.response_content) {
              await message.reply(processedContent || matchedCommand.response_content);
              responseSent = true;
            }
            break;

          case 'embed':
            if (matchedCommand.embed_data) {
              const embedData = JSON.parse(matchedCommand.embed_data);
              const embed = createDiscordEmbed(embedData);
              
              // Add interactive components if configured
              const components = createInteractiveComponents(matchedCommand.interactive_type, matchedCommand.interactive_data);
              
              await message.reply({ embeds: [embed], components });
              responseSent = true;
            }
            break;

          case 'dm':
            if (matchedCommand.dm_content) {
              const dmContent = processedContent || matchedCommand.dm_content;
              await message.author.send(dmContent);
              await message.reply('✅ Check your DMs!');
              responseSent = true;
            }
            break;
        }

        // Log the command usage
        await logCommandUsage(matchedCommand, message, responseSent);

        // Update usage count
        await appDb.query(
          'UPDATE custom_commands SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?',
          [matchedCommand.id]
        );

      } catch (error) {
        console.error(`Error executing custom command ${matchedCommand.command_name}:`, error);
        await message.reply('❌ An error occurred while executing this command.');
        
        // Log the error
        await logCommandUsage(matchedCommand, message, false, error.message);
      }

    } catch (error) {
      console.error('Error in messageCreate event:', error);
    }
  },
};

// Helper function to process variables
function processVariables(command, message) {
  let content = '';
  
  switch (command.response_type) {
    case 'message':
      content = command.response_content || '';
      break;
    case 'dm':
      content = command.dm_content || '';
      break;
    default:
      return content;
  }

  // Replace variables with actual values
  content = content.replace(/\[username\]/g, message.author.username);
  content = content.replace(/\[mention\]/g, message.author.toString());
  content = content.replace(/\[id\]/g, message.author.id);
  content = content.replace(/\[avatar\]/g, message.author.displayAvatarURL());
  content = content.replace(/\[joined\]/g, message.member.joinedAt.toDateString());
  content = content.replace(/\[roles\]/g, message.member.roles.cache.map(r => r.name).join(', '));
  content = content.replace(/\[server\]/g, message.guild.name);
  content = content.replace(/\[server_id\]/g, message.guild.id);
  content = content.replace(/\[member_count\]/g, message.guild.memberCount);
  content = content.replace(/\[channel\]/g, message.channel.name);
  content = content.replace(/\[channel_id\]/g, message.channel.id);
  content = content.replace(/\[time\]/g, new Date().toLocaleTimeString());
  content = content.replace(/\[date\]/g, new Date().toLocaleDateString());
  content = content.replace(/\[timestamp\]/g, new Date().toISOString());

  return content;
}

// Helper function to create Discord embed
function createDiscordEmbed(embedData) {
  const { EmbedBuilder } = require('discord.js');
  
  const embed = new EmbedBuilder();
  
  if (embedData.title) embed.setTitle(embedData.title);
  if (embedData.description) embed.setDescription(embedData.description);
  if (embedData.color) embed.setColor(parseInt(embedData.color.replace('#', ''), 16));
  if (embedData.imageUrl) embed.setImage(embedData.imageUrl);
  if (embedData.thumbnailUrl) embed.setThumbnail(embedData.thumbnailUrl);
  if (embedData.timestamp) embed.setTimestamp(embedData.timestamp);
  
  if (embedData.author) {
    embed.setAuthor({
      name: embedData.author.name || 'Custom Command',
      iconURL: embedData.author.iconUrl
    });
  }
  
  if (embedData.footer) {
    embed.setFooter({
      text: embedData.footer.text || 'ServerMate Custom Command',
      iconURL: embedData.footer.iconUrl
    });
  }

  return embed;
}

// Helper function to create interactive components
function createInteractiveComponents(interactiveType, interactiveData) {
  if (interactiveType === 'none' || !interactiveData) return [];

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  if (interactiveType === 'buttons' && interactiveData.buttons) {
    const row = new ActionRowBuilder();
    
    interactiveData.buttons.forEach(button => {
      const buttonComponent = new ButtonBuilder()
        .setLabel(button.label)
        .setURL(button.url)
        .setStyle(ButtonStyle.Link);
      
      row.addComponents(buttonComponent);
    });

    return [row];
  }

  return [];
}

// Helper function to log command usage
async function logCommandUsage(command, message, responseSent, errorMessage = null) {
  try {
    await appDb.query(
      `INSERT INTO custom_command_logs (
        guild_id, command_id, user_id, username, channel_id, channel_name, 
        response_sent, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.guild.id,
        command.id,
        message.author.id,
        message.author.username,
        message.channel.id,
        message.channel.name,
        responseSent,
        errorMessage
      ]
    );
  } catch (error) {
    console.error('Error logging command usage:', error);
  }
}

// Handle sticky message functionality
async function handleStickyMessage(message, client) {
  try {
    const guildId = message.guild.id;
    const channelId = message.channel.id;

    // Check if moderation feature is enabled (sticky is a moderation command)
    const features = await GuildDatabase.getGuildFeatures(guildId);
    if (!features.moderation) return;

    // Check if there's a sticky message for this channel
    const stickyData = await GuildDatabase.getStickyMessage(guildId, channelId);
    if (!stickyData || !stickyData.message_id) return;

    // Try to delete the old sticky message
    try {
      const oldMessage = await message.channel.messages.fetch(stickyData.message_id);
      await oldMessage.delete();
    } catch (error) {
      // Message might already be deleted, ignore error
      console.log(`Old sticky message not found or already deleted: ${stickyData.message_id}`);
    }

    // Post new sticky message
    const newStickyMessage = await message.channel.send({
      content: stickyData.content,
      allowedMentions: { parse: [] } // Disable mentions to prevent spam
    });

    // Update the message ID in database
    await GuildDatabase.updateStickyMessageId(guildId, channelId, newStickyMessage.id);

    // Update memory cache
    if (!global.stickyMessages) {
      global.stickyMessages = new Map();
    }
    global.stickyMessages.set(`${guildId}-${channelId}`, {
      messageId: newStickyMessage.id,
      content: stickyData.content,
      createdBy: stickyData.created_by
    });

  } catch (error) {
    console.error('Error handling sticky message:', error);
  }
}
