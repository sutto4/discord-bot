const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { AIService } = require('../services/aiService');

const aiService = new AIService();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('summary')
        .setDescription('Summarize messages from a specific message ID to now using AI')
        .addStringOption(option =>
            option
                .setName('message_id')
                .setDescription('The message ID to start summarizing from')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const messageId = interaction.options.getString('message_id');
            const channel = interaction.channel;
            const guild = interaction.guild;
            const user = interaction.user;

            console.log(`[AI-SUMMARY] User ${user.tag} requested summary from message ${messageId} in ${guild.name}`);

            // Check if feature is enabled
            if (!await aiService.isFeatureEnabled(guild.id)) {
                const embed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle('❌ Feature Not Available')
                    .setDescription('AI summarization is not enabled for this server. Contact an administrator to enable this premium feature.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get guild configuration
            const config = await aiService.getGuildConfig(guild.id);
            if (!config || !config.enabled) {
                const embed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle('❌ Feature Not Configured')
                    .setDescription('AI summarization is not configured for this server. Contact an administrator to set it up.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Validate message ID format
            if (!/^\d{17,19}$/.test(messageId)) {
                const embed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle('❌ Invalid Message ID')
                    .setDescription('Please provide a valid Discord message ID. You can get this by right-clicking on a message and selecting "Copy Message Link" or "Copy ID".')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Try to fetch the starting message
            let startMessage;
            try {
                startMessage = await channel.messages.fetch(messageId);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor('#ff6b6b')
                    .setTitle('❌ Message Not Found')
                    .setDescription('Could not find the specified message. Make sure the message ID is correct and the message exists in this channel.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Show processing message
            const processingEmbed = new EmbedBuilder()
                .setColor('#4f46e5')
                .setTitle('🤖 Processing Summary...')
                .setDescription(`Fetching messages from ${new Date(startMessage.createdTimestamp).toLocaleString()} to now...`)
                .setTimestamp();

            await interaction.editReply({ embeds: [processingEmbed] });

            // Fetch messages after the specified message
            const messages = await channel.messages.fetch({ 
                after: messageId, 
                limit: config.max_messages_per_summary 
            });
            
            const messageArray = Array.from(messages.values()).reverse(); // Reverse to get chronological order

            // Filter out bot messages and empty messages
            const filteredMessages = messageArray.filter(msg => 
                !msg.author.bot && 
                msg.content.trim().length > 0 &&
                !msg.content.startsWith('/') // Filter out slash commands
            );

            if (filteredMessages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('⚠️ No Messages Found')
                    .setDescription('No valid messages found to summarize after the specified message. Make sure there are non-bot messages with content.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Update processing message
            const updatedProcessingEmbed = new EmbedBuilder()
                .setColor('#4f46e5')
                .setTitle('🤖 Processing Summary...')
                .setDescription(`Analyzing ${filteredMessages.length} messages...`)
                .setTimestamp();

            await interaction.editReply({ embeds: [updatedProcessingEmbed] });

            // Generate summary
            const result = await aiService.summarizeMessages(
                filteredMessages,
                guild.id,
                user.id,
                channel.id
            );

            // Create success embed
            const summaryEmbed = new EmbedBuilder()
                .setColor('#10b981')
                .setTitle('📝 Message Summary')
                .setDescription(result.summary)
                .addFields(
                    { name: '📊 Statistics', value: `Messages analyzed: ${result.messageCount}\nTokens used: ${result.tokensUsed}\nCost: $${result.cost.toFixed(4)}`, inline: true },
                    { name: '⏰ Time Range', value: `${new Date(filteredMessages[0].createdTimestamp).toLocaleString()} - ${new Date(filteredMessages[filteredMessages.length - 1].createdTimestamp).toLocaleString()}`, inline: true },
                    { name: '📍 Starting Message', value: `[Jump to message](https://discord.com/channels/${guild.id}/${channel.id}/${messageId})`, inline: false }
                )
                .setFooter({ text: `Requested by ${user.tag} • AI Model: ${config.model}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [summaryEmbed] });

        } catch (error) {
            console.error('[AI-SUMMARY] Error:', error);

            let errorMessage = 'An unexpected error occurred while generating the summary.';
            
            if (error.message.includes('rate limit')) {
                errorMessage = `Rate limit exceeded: ${error.message}`;
            } else if (error.message.includes('not enabled')) {
                errorMessage = error.message;
            } else if (error.message.includes('not configured')) {
                errorMessage = error.message;
            } else if (error.message.includes('Too many messages')) {
                errorMessage = error.message;
            } else if (error.message.includes('too long')) {
                errorMessage = error.message;
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('❌ Summary Failed')
                .setDescription(errorMessage)
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (editError) {
                console.error('[AI-SUMMARY] Failed to edit reply:', editError);
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};
