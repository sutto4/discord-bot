const { CommandRegistry } = require('./services/commandRegistry');

class CommandManager {
  constructor(client) {
    this.client = client;
    this.commandRegistry = new CommandRegistry(client);
    this.setupCommandHandler();
  }

  setupCommandHandler() {
    // Handle slash command interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;
      console.log(`[COMMAND-MANAGER] Command executed: ${commandName} by ${interaction.user.tag}`);

      try {
        // Route commands based on name
        switch (commandName) {
          case 'warn':
            await this.handleWarn(interaction);
            break;
          case 'kick':
            await this.handleKick(interaction);
            break;
          case 'ban':
            await this.handleBan(interaction);
            break;
          case 'mute':
            await this.handleMute(interaction);
            break;
          case 'role':
            await this.handleRole(interaction);
            break;
          case 'custom':
            await this.handleCustom(interaction);
            break;
          case 'sendverify':
            await this.handleSendVerify(interaction);
            break;
          case 'setverifylog':
            await this.handleSetVerifyLog(interaction);
            break;
          case 'feedback':
            await this.handleFeedback(interaction);
            break;
          case 'embed':
            await this.handleEmbed(interaction);
            break;
          default:
            await interaction.reply({ 
              content: 'Unknown command', 
              ephemeral: true 
            });
        }
      } catch (error) {
        console.error(`[COMMAND-MANAGER] Error handling command ${commandName}:`, error);
        await interaction.reply({ 
          content: 'An error occurred while executing this command.', 
          ephemeral: true 
        });
      }
    });
  }

  async handleWarn(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.reply({
      content: `⚠️ **Warning issued to ${user.tag}**\nReason: ${reason}`,
      ephemeral: false
    });
  }

  async handleKick(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      await interaction.guild.members.kick(user, reason);
      await interaction.reply({
        content: `👢 **${user.tag} has been kicked**\nReason: ${reason}`,
        ephemeral: false
      });
    } catch (error) {
      await interaction.reply({
        content: `❌ Failed to kick ${user.tag}: ${error.message}`,
        ephemeral: true
      });
    }
  }

  async handleBan(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = interaction.options.getString('duration');

    try {
      await interaction.guild.members.ban(user, { reason });
      await interaction.reply({
        content: `🔨 **${user.tag} has been banned**\nReason: ${reason}${duration ? `\nDuration: ${duration}` : ''}`,
        ephemeral: false
      });
    } catch (error) {
      await interaction.reply({
        content: `❌ Failed to ban ${user.tag}: ${error.message}`,
        ephemeral: true
      });
    }
  }

  async handleMute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.reply({
      content: `🔇 **${user.tag} has been muted**\nDuration: ${duration}\nReason: ${reason}`,
      ephemeral: false
    });
  }

  async handleRole(interaction) {
    const action = interaction.options.getString('action');
    const role = interaction.options.getRole('role');

    let content = '';
    switch (action) {
      case 'add':
        content = `➕ **Role management**: Add role ${role?.name || 'N/A'}`;
        break;
      case 'remove':
        content = `➖ **Role management**: Remove role ${role?.name || 'N/A'}`;
        break;
      case 'list':
        content = `📋 **Role management**: List roles`;
        break;
      default:
        content = `❓ **Role management**: Unknown action ${action}`;
    }

    await interaction.reply({
      content,
      ephemeral: false
    });
  }

  async handleCustom(interaction) {
    const command = interaction.options.getString('command');

    await interaction.reply({
      content: `⚡ **Custom command executed**: ${command}`,
      ephemeral: false
    });
  }

  async handleSendVerify(interaction) {
    const user = interaction.options.getUser('user');

    await interaction.reply({
      content: `✅ **Verification sent to**: ${user.tag}`,
      ephemeral: false
    });
  }

  async handleSetVerifyLog(interaction) {
    const channel = interaction.options.getChannel('channel');

    await interaction.reply({
      content: `📝 **Verification log channel set to**: ${channel}`,
      ephemeral: false
    });
  }

  async handleFeedback(interaction) {
    const message = interaction.options.getString('message');
    const category = interaction.options.getString('category') || 'General';

    await interaction.reply({
      content: `💬 **Feedback received**\nCategory: ${category}\nMessage: ${message}`,
      ephemeral: false
    });
  }

  async handleEmbed(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || '#0099ff';

    const embed = {
      title: title || 'Embed Message',
      description: description || 'No description provided',
      color: parseInt(color.replace('#', ''), 16),
      timestamp: new Date().toISOString()
    };

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }

  // Method to update commands for a guild (called by web app)
  async updateGuildCommands(guildId, features) {
    try {
      console.log(`[COMMAND-MANAGER] Updating commands for guild ${guildId} with features:`, features);
      
      if (features.length === 0) {
        // No features enabled, remove all commands
        await this.commandRegistry.unregisterCommands(guildId, []);
        return { success: true, message: 'All commands removed' };
      } else {
        // Update commands based on features
        const result = await this.commandRegistry.updateGuildCommands(guildId, features);
        return { success: true, message: `Commands updated: ${result.commandsCount} commands` };
      }
    } catch (error) {
      console.error(`[COMMAND-MANAGER] Error updating commands for guild ${guildId}:`, error);
      throw error;
    }
  }

  // Method to get current commands for a guild
  getGuildCommands(guildId) {
    return this.commandRegistry.getRegisteredCommands(guildId);
  }
}

module.exports = { CommandManager };
