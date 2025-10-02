const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { AIService } = require('../services/aiService');

const aiService = new AIService();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('summarise')
        .setDescription('Summarize messages in this channel using AI')
        .addSubcommand(subcommand =>
            subcommand
                .setName('last')
                .setDescription('Summarize the last X messages')
                .addIntegerOption(option =>
                    option
                        .setName('count')
                        .setDescription('Number of messages to summarize (1-50)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('from')
                .setDescription('Summarize from a specific message ID to now')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID to start summarizing from')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();
            const channel = interaction.channel;
            const guild = interaction.guild;
            const user = interaction.user;

            console.log(`[AI-SUMMARISE] User ${user.tag} requested ${subcommand} summary in ${guild.name}`);

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

            let messages;
            let messageArray;
            let commandType;

            if (subcommand === 'last') {
                const count = interaction.options.getInteger('count');
                
                // Validate count against guild limits
                if (count > config.max_messages_per_summary) {
                    const embed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('❌ Too Many Messages')
                        .setDescription(`Maximum allowed messages per summary: ${config.max_messages_per_summary}`)
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                // Fetch messages
                messages = await channel.messages.fetch({ limit: count });
                messageArray = Array.from(messages.values()).reverse(); // Reverse to get chronological order
                commandType = 'summarise';
                
            } else if (subcommand === 'from') {
                const messageId = interaction.options.getString('message_id');
                
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

                // Fetch messages after the specified message
                messages = await channel.messages.fetch({ 
                    after: messageId, 
                    limit: config.max_messages_per_summary 
                });
                
                messageArray = Array.from(messages.values()).reverse(); // Reverse to get chronological order
                commandType = 'summary';
            }

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
                    .setDescription('No valid messages found to summarize. Make sure there are non-bot messages with content.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Show processing message
            const processingEmbed = new EmbedBuilder()
                .setColor('#4f46e5')
                .setTitle('🤖 Processing Summary...')
                .setDescription(`Analyzing ${filteredMessages.length} messages...`)
                .setTimestamp();

            await interaction.editReply({ embeds: [processingEmbed] });

            // Generate summary
            const result = await aiService.summarizeMessages(
                filteredMessages,
                guild.id,
                user.id,
                channel.id,
                commandType
            );

            // Create success embed
            const summaryEmbed = new EmbedBuilder()
                .setColor('#10b981')
                .setTitle('📝 Message Summary')
                .setDescription(result.summary)
                .addFields(
                    { name: '📊 Statistics', value: `Messages analyzed: ${result.messageCount}\nTokens used: ${result.tokensUsed}\nCost: $${result.cost.toFixed(4)}`, inline: true },
                    { name: '⏰ Time Range', value: `${new Date(filteredMessages[0].createdTimestamp).toLocaleString()} - ${new Date(filteredMessages[filteredMessages.length - 1].createdTimestamp).toLocaleString()}`, inline: true }
                )
                .setFooter({ text: `Requested by ${user.tag} • AI Model: ${config.model}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [summaryEmbed] });

        } catch (error) {
            console.error('[AI-SUMMARISE] Error:', error);

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
                console.error('[AI-SUMMARISE] Failed to edit reply:', editError);
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};
