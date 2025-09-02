const { CommandRegistry } = require('./services/commandRegistry');

class CommandManager {
  constructor(client) {
    this.client = client;
    this.commandRegistry = new CommandRegistry(client);
  }

  // Method to handle interactions - called from existing event system
  async handleInteraction(interaction) {
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
        case 'unmute':
          await this.handleUnmute(interaction);
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
        case 'setmodlog':
          await this.handleSetModLog(interaction);
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
  }

  async handleWarn(interaction) {
    // Reuse the existing warn command handler
    const warnCommand = require('./commands/warn');
    await warnCommand.execute(interaction);
  }

  async handleKick(interaction) {
    // Reuse the existing kick command handler
    const kickCommand = require('./commands/kick');
    await kickCommand.execute(interaction);
  }

  async handleBan(interaction) {
    // Reuse the existing ban command handler
    const banCommand = require('./commands/ban');
    await banCommand.execute(interaction);
  }

  async handleMute(interaction) {
    // Reuse the existing mute command handler
    const muteCommand = require('./commands/mute');
    await muteCommand.execute(interaction);
  }

  async handleUnmute(interaction) {
    // Reuse the existing unmute command handler
    const unmuteCommand = require('./commands/unmute');
    await unmuteCommand.execute(interaction);
  }

  async handleRole(interaction) {
    // Role management is handled by syncroles command
    const syncRolesCommand = require('./commands/syncroles');
    await syncRolesCommand.execute(interaction);
  }

  async handleCustom(interaction) {
    const command = interaction.options.getString('command');

    await interaction.reply({
      content: `⚡ **Custom command executed**: ${command}`,
      ephemeral: false
    });
  }

  async handleSendVerify(interaction) {
    // Reuse the existing sendverify command handler
    const sendVerifyCommand = require('./commands/sendverify');
    await sendVerifyCommand.execute(interaction);
  }

  async handleSetVerifyLog(interaction) {
    // Reuse the existing setverifylog command handler
    const setVerifyLogCommand = require('./commands/setverifylog');
    await setVerifyLogCommand.execute(interaction);
  }

  async handleSetModLog(interaction) {
    // Reuse the existing setmodlog command handler
    const setModLogCommand = require('./commands/setmodlog');
    await setModLogCommand.execute(interaction);
  }

  async handleFeedback(interaction) {
    // Reuse the existing feedback command handler
    const feedbackCommand = require('./commands/feedback');
    await feedbackCommand.execute(interaction);
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
