const { SlashCommandBuilder } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');
const { setGuildPrefix, isValidPrefix } = require('../utils/prefix');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setprefix')
		.setDescription('Set a custom prefix for this server (dot commands)')
		.addStringOption(option =>
			option
				.setName('prefix')
				.setDescription('The new custom prefix to use (e.g. ! or ?)')
				.setRequired(true)
		),

	async execute(interaction) {
		const guildId = interaction.guildId;
		const guildName = interaction.guild.name;
                const prefix = interaction.options.getString('prefix');

		// Ensure this guild exists in DB
		await GuildDatabase.initializeGuild(guildId, guildName);

		// Check feature flag
		const hasFeature = await GuildDatabase.hasFeature(guildId, 'custom_prefix');
		if (!hasFeature) {
			return await interaction.reply({
				content: '❌ This server does not have the `custom_prefix` feature enabled.',
				ephemeral: true
			});
		}

                // Validate and update prefix
                if (!isValidPrefix(prefix)) {
                        return await interaction.reply({
                                content: '❌ Invalid prefix. Prefix must be 1-5 non-space characters.',
                                ephemeral: true
                        });
                }

                await setGuildPrefix(guildId, prefix);

		await interaction.reply({
			content: `✅ Custom prefix updated to: \`${prefix}\``,
			ephemeral: true
		});
	}
};
