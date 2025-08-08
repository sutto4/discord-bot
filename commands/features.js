const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('features')
		.setDescription('Manage premium features for this guild')
		.addSubcommand(subcommand =>
			subcommand
				.setName('enable')
				.setDescription('Enable a premium feature for this guild')
				.addStringOption(option =>
					option.setName('feature')
						.setDescription('The feature to enable')
						.setRequired(true)
						.addChoices(
							{ name: 'Tebex Integration', value: 'tebex_integration' },
							{ name: 'Advanced Logging', value: 'advanced_logging' },
							{ name: 'Custom Roles', value: 'custom_roles' }
						)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('disable')
				.setDescription('Disable a premium feature for this guild')
				.addStringOption(option =>
					option.setName('feature')
						.setDescription('The feature to disable')
						.setRequired(true)
						.addChoices(
							{ name: 'Tebex Integration', value: 'tebex_integration' },
							{ name: 'Advanced Logging', value: 'advanced_logging' },
							{ name: 'Custom Roles', value: 'custom_roles' }
						)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('Show enabled premium features for this guild'))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		const guildId = interaction.guild.id;
		const guildName = interaction.guild.name;

		// Initialize guild if not exists
		await GuildDatabase.initializeGuild(guildId, guildName);

		if (subcommand === 'enable') {
			const feature = interaction.options.getString('feature');
			await GuildDatabase.setFeature(guildId, feature, true);
			
			const featureNames = {
				'tebex_integration': 'Tebex Integration',
				'advanced_logging': 'Advanced Logging',
				'custom_roles': 'Custom Roles'
			};
			
			await interaction.reply({
				content: `✅ **${featureNames[feature]}** has been **enabled** for this guild.\n\n💡 This premium feature is now active and will take effect immediately.`,
				flags: 64
			});

		} else if (subcommand === 'disable') {
			const feature = interaction.options.getString('feature');
			await GuildDatabase.setFeature(guildId, feature, false);
			
			const featureNames = {
				'tebex_integration': 'Tebex Integration',
				'advanced_logging': 'Advanced Logging',
				'custom_roles': 'Custom Roles'
			};
			
			await interaction.reply({
				content: `❌ **${featureNames[feature]}** has been **disabled** for this guild.`,
				flags: 64
			});

		} else if (subcommand === 'list') {
			const config = await GuildDatabase.getGuildConfig(guildId);
			const features = config?.features ? JSON.parse(config.features) : {};
			
			const featureList = [
				`🔗 **Tebex Integration**: ${features.tebex_integration ? '✅ Enabled' : '❌ Disabled'}`,
				`📊 **Advanced Logging**: ${features.advanced_logging ? '✅ Enabled' : '❌ Disabled'}`,
				`🎭 **Custom Roles**: ${features.custom_roles ? '✅ Enabled' : '❌ Disabled'}`
			].join('\n');

			await interaction.reply({
				content: `**Premium Features for ${guildName}**\n\n${featureList}\n\n💰 Contact support to enable additional features.`,
				flags: 64
			});
		}
	},
};
