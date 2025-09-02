class CommandRegistry {
  constructor(discordClient) {
    this.commands = new Map();
    this.discordClient = discordClient;
  }

  async registerCommands(guildId, features) {
    try {
      var commands = this.getCommandsForFeatures(features);
      
      console.log(`[COMMAND-REGISTRY] Registering commands for guild ${guildId}:`, commands);
      
      // Register commands with Discord API
      if (this.discordClient.application && this.discordClient.application.commands) {
        await this.discordClient.application.commands.set(commands, guildId);
        console.log(`[COMMAND-REGISTRY] Successfully registered ${commands.length} commands for guild ${guildId}`);
      } else {
        console.error('[COMMAND-REGISTRY] Discord client not ready');
      }
      
      // Update local registry
      this.commands.set(guildId, commands);
      
      return { success: true, commandsCount: commands.length };
    } catch (error) {
      console.error(`[COMMAND-REGISTRY] Error registering commands for guild ${guildId}:`, error);
      throw error;
    }
  }

  async unregisterCommands(guildId, features) {
    try {
      console.log(`[COMMAND-REGISTRY] Unregistering commands for guild ${guildId} features:`, features);
      
      // Remove commands from Discord API
      if (this.discordClient.application && this.discordClient.application.commands) {
        await this.discordClient.application.commands.set([], guildId);
        console.log(`[COMMAND-REGISTRY] Successfully unregistered all commands for guild ${guildId}`);
      }
      
      // Update local registry
      this.commands.delete(guildId);
      
      return { success: true };
    } catch (error) {
      console.error(`[COMMAND-REGISTRY] Error unregistering commands for guild ${guildId}:`, error);
      throw error;
    }
  }

  async updateGuildCommands(guildId, features) {
    try {
      console.log(`[COMMAND-REGISTRY] Updating commands for guild ${guildId} with features:`, features);

      // Get all commands for current features
      var allCommands = this.getCommandsForFeatures(features);
      console.log(`[COMMAND-REGISTRY] Generated ${allCommands.length} commands for features:`, allCommands.map(cmd => cmd.name));

      // When called from admin page, features already represent enabled commands
      // So we don't need to filter - just use all commands for the given features
      var enabledCommands = allCommands;

      // Update commands with Discord API
      if (this.discordClient.application && this.discordClient.application.commands) {
        await this.discordClient.application.commands.set(enabledCommands, guildId);
        console.log(`[COMMAND-REGISTRY] Successfully updated commands for guild ${guildId}: ${enabledCommands.length}/${allCommands.length} enabled`);
      }

      // Update local registry
      this.commands.set(guildId, enabledCommands);

      return { success: true, commandsCount: enabledCommands.length, totalCommands: allCommands.length };
    } catch (error) {
      console.error(`[COMMAND-REGISTRY] Error updating commands for guild ${guildId}:`, error);
      throw error;
    }
  }

  async filterEnabledCommands(guildId, allCommands) {
    try {
      // Import database connection (this would need to be available in the service)
      var appDb = require('../config/database').appDb;

      // Get command states for this guild
      var result = await appDb.query(
        "SELECT command_name, enabled FROM guild_commands WHERE guild_id = ?",
        [guildId]
      );
      var commandStates = result[0];

      // Create a map of enabled commands
      var enabledCommandMap = new Map();
      commandStates.forEach(function(state) {
        enabledCommandMap.set(state.command_name, state.enabled === 1);
      });

      // Filter commands based on their enabled state
      var enabledCommands = allCommands.filter(function(cmd) {
        var enabled = enabledCommandMap.get(cmd.name);
        return enabled !== false; // Default to enabled if not set
      });

      console.log(`[COMMAND-REGISTRY] Guild ${guildId}: ${enabledCommands.length}/${allCommands.length} commands enabled`);
      return enabledCommands;

    } catch (error) {
      console.error(`[COMMAND-REGISTRY] Error filtering commands for guild ${guildId}:`, error);
      // Return all commands if there's an error with the database
      return allCommands;
    }
  }

  getCommandsForFeatures(features) {
    var allCommands = [];
    
    // Check if we're getting individual command names or feature names
    var isIndividualCommands = features.some(function(feature) {
      return ['warn', 'kick', 'ban', 'mute', 'unmute', 'role', 'custom', 'sendverify', 'setverifylog', 'feedback', 'embed'].includes(feature);
    });
    
    if (isIndividualCommands) {
      // Handle individual command names
      return this.getCommandsForIndividualCommands(features);
    }
    
    if (features.includes('moderation')) {
      allCommands.push(
        { 
          name: 'warn', 
          description: 'Warn a user for breaking rules',
          options: [
            {
              name: 'user',
              description: 'The user to warn',
              type: 6, // USER type
              required: true
            },
            {
              name: 'reason',
              description: 'Reason for the warning',
              type: 3, // STRING type
              required: false
            }
          ]
        },
        { 
          name: 'kick', 
          description: 'Kick a user from the server',
          options: [
            {
              name: 'user',
              description: 'The user to kick',
              type: 6,
              required: true
            },
            {
              name: 'reason',
              description: 'Reason for the kick',
              type: 3,
              required: false
            }
          ]
        },
        { 
          name: 'ban', 
          description: 'Ban a user from the server',
          options: [
            {
              name: 'user',
              description: 'The user to ban',
              type: 6,
              required: true
            },
            {
              name: 'reason',
              description: 'Reason for the ban',
              type: 3,
              required: false
            },
            {
              name: 'duration',
              description: 'Duration of the ban (e.g., 7d, 30d)',
              type: 3,
              required: false
            }
          ]
        },
        { 
          name: 'mute', 
          description: 'Mute a user temporarily',
          options: [
            {
              name: 'user',
              description: 'The user to mute',
              type: 6,
              required: true
            },
            {
              name: 'duration',
              description: 'Duration of the mute (e.g., 1h, 24h)',
              type: 3,
              required: true
            },
            {
              name: 'reason',
              description: 'Reason for the mute',
              type: 3,
              required: false
            }
          ]
        }
      );
    }
    
    if (features.includes('reaction_roles')) {
      allCommands.push(
        { 
          name: 'role', 
          description: 'Manage reaction roles',
          options: [
            {
              name: 'action',
              description: 'Action to perform',
              type: 3,
              required: true,
              choices: [
                { name: 'add', value: 'add' },
                { name: 'remove', value: 'remove' },
                { name: 'list', value: 'list' }
              ]
            },
            {
              name: 'role',
              description: 'The role to manage',
              type: 8, // ROLE type
              required: false
            }
          ]
        }
      );
    }

    if (features.includes('custom_commands')) {
      allCommands.push(
        { 
          name: 'custom', 
          description: 'Execute a custom command',
          options: [
            {
              name: 'command',
              description: 'The custom command to execute',
              type: 3,
              required: true
            }
          ]
        }
      );
    }

    if (features.includes('verification_system')) {
      allCommands.push(
        { 
          name: 'sendverify', 
          description: 'Send verification message to a user',
          options: [
            {
              name: 'user',
              description: 'The user to send verification to',
              type: 6,
              required: true
            }
          ]
        },
        { 
          name: 'setverifylog', 
          description: 'Set the verification log channel',
          options: [
            {
              name: 'channel',
              description: 'The channel to log verifications',
              type: 7, // CHANNEL type
              required: true
            }
          ]
        }
      );
    }

    if (features.includes('feedback_system')) {
      allCommands.push(
        { 
          name: 'feedback', 
          description: 'Submit feedback about the server',
          options: [
            {
              name: 'message',
              description: 'Your feedback message',
              type: 3,
              required: true
            },
            {
              name: 'category',
              description: 'Feedback category',
              type: 3,
              required: false,
              choices: [
                { name: 'General', value: 'general' },
                { name: 'Bug Report', value: 'bug' },
                { name: 'Feature Request', value: 'feature' },
                { name: 'Complaint', value: 'complaint' }
              ]
            }
          ]
        }
      );
    }

    if (features.includes('embedded_messages')) {
      allCommands.push(
        { 
          name: 'embed', 
          description: 'Create an embedded message',
          options: [
            {
              name: 'title',
              description: 'Title of the embed',
              type: 3,
              required: false
            },
            {
              name: 'description',
              description: 'Description of the embed',
              type: 3,
              required: false
            },
            {
              name: 'color',
              description: 'Color of the embed (hex code)',
              type: 3,
              required: false
            }
          ]
        }
      );
    }

    return allCommands;
  }

  getCommandsForIndividualCommands(commandNames) {
    var allCommands = [];
    
    // Define all available commands
    var commandDefinitions = {
      'warn': {
        name: 'warn',
        description: 'Warn a user for breaking rules',
        options: [
          {
            name: 'user',
            description: 'The user to warn',
            type: 6, // USER type
            required: true
          },
          {
            name: 'reason',
            description: 'Reason for the warning',
            type: 3, // STRING type
            required: false
          }
        ]
      },
      'kick': {
        name: 'kick',
        description: 'Kick a user from the server',
        options: [
          {
            name: 'user',
            description: 'The user to kick',
            type: 6,
            required: true
          },
          {
            name: 'reason',
            description: 'Reason for the kick',
            type: 3,
            required: false
          }
        ]
      },
      'ban': {
        name: 'ban',
        description: 'Ban a user from the server',
        options: [
          {
            name: 'user',
            description: 'The user to ban',
            type: 6,
            required: true
          },
          {
            name: 'reason',
            description: 'Reason for the ban',
            type: 3,
            required: false
          },
          {
            name: 'duration',
            description: 'Duration of the ban (e.g., 7d, 30d)',
            type: 3,
            required: false
          }
        ]
      },
      'mute': {
        name: 'mute',
        description: 'Mute a user in the server',
        options: [
          {
            name: 'user',
            description: 'The user to mute',
            type: 6,
            required: true
          },
          {
            name: 'duration',
            description: 'Duration of the mute (e.g., 1h, 7d)',
            type: 3,
            required: true
          },
          {
            name: 'reason',
            description: 'Reason for the mute',
            type: 3,
            required: false
          }
        ]
      },
      'unmute': {
        name: 'unmute',
        description: 'Unmute a user in the server',
        options: [
          {
            name: 'user',
            description: 'The user to unmute',
            type: 6,
            required: true
          }
        ]
      },
      'role': {
        name: 'role',
        description: 'Manage user roles',
        options: [
          {
            name: 'action',
            description: 'Action to perform',
            type: 3,
            required: true,
            choices: [
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' }
            ]
          },
          {
            name: 'user',
            description: 'The user to manage',
            type: 6,
            required: true
          },
          {
            name: 'role',
            description: 'The role to add/remove',
            type: 8, // ROLE type
            required: true
          }
        ]
      },
      'custom': {
        name: 'custom',
        description: 'Execute custom commands',
        options: [
          {
            name: 'command',
            description: 'The custom command to execute',
            type: 3,
            required: true
          }
        ]
      },
      'sendverify': {
        name: 'sendverify',
        description: 'Send verification message',
        options: []
      },
      'setverifylog': {
        name: 'setverifylog',
        description: 'Set verification log channel',
        options: [
          {
            name: 'channel',
            description: 'The channel to set as verification log',
            type: 7, // CHANNEL type
            required: true
          }
        ]
      },
      'feedback': {
        name: 'feedback',
        description: 'Submit feedback',
        options: [
          {
            name: 'message',
            description: 'Your feedback message',
            type: 3,
            required: true
          }
        ]
      },
      'embed': {
        name: 'embed',
        description: 'Send embedded messages',
        options: [
          {
            name: 'title',
            description: 'Title of the embed',
            type: 3,
            required: false
          },
          {
            name: 'description',
            description: 'Description of the embed',
            type: 3,
            required: false
          },
          {
            name: 'color',
            description: 'Color of the embed (hex code)',
            type: 3,
            required: false
          }
        ]
      }
    };
    
    // Add commands for the requested command names
    for (var i = 0; i < commandNames.length; i++) {
      var commandName = commandNames[i];
      if (commandDefinitions[commandName]) {
        allCommands.push(commandDefinitions[commandName]);
      }
    }
    
    return allCommands;
  }

  getCommandsForGuild(guildId, enabledFeatures) {
    var commands = this.getCommandsForFeatures(enabledFeatures);
    this.commands.set(guildId, commands);
    return commands;
  }

  getAllGuildCommands(guildFeatures) {
    var allCommands = new Map();
    
    for (var i = 0; i < guildFeatures.length; i++) {
      var guildId = guildFeatures[i][0];
      var features = guildFeatures[i][1];
      var commands = this.getCommandsForFeatures(features);
      allCommands.set(guildId, commands);
      this.commands.set(guildId, commands);
    }
    
    return allCommands;
  }

  getRegisteredCommands(guildId) {
    return this.commands.get(guildId) || [];
  }

  getAllRegisteredGuilds() {
    return Array.from(this.commands.keys());
  }
}

module.exports = { CommandRegistry };
