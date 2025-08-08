const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('features')
		.setDescription('View premium features for this guild')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const guildId = interaction.guild.id;
		const guildName = interaction.guild.name;

		// Initialize guild if not exists
		await GuildDatabase.initializeGuild(guildId, guildName);

		// Get current package and features
		const currentPackage = await GuildDatabase.getGuildPackage(guildId);
		const packages = await GuildDatabase.getAvailablePackages();
		const features = await GuildDatabase.getGuildFeatures(guildId);
		const allFeatures = await GuildDatabase.getAllFeatures();

		let statusText = `**${guildName} - Current Package: ${packages[currentPackage]?.name || 'Custom'}**\n\n`;
		
		// Show current features grouped by package level
		const featuresByPackage = {
			'free': [],
			'premium': []
		};

		allFeatures.forEach(feature => {
			if (featuresByPackage[feature.minimum_package]) {
				featuresByPackage[feature.minimum_package].push({
					key: feature.feature_key,
					name: feature.feature_name,
					enabled: features[feature.feature_key] || false
				});
			}
		});

		for (const [packageLevel, packageFeatures] of Object.entries(featuresByPackage)) {
			if (packageFeatures.length > 0) {
				statusText += `**${packageLevel.charAt(0).toUpperCase() + packageLevel.slice(1)} Features:**\n`;
				packageFeatures.forEach(feature => {
					statusText += `${feature.enabled ? '✅' : '❌'} ${feature.name}\n`;
				});
				statusText += '\n';
			}
		}

		statusText += '**Available Packages:**\n';
		for (const [key, pkg] of Object.entries(packages)) {
			const current = currentPackage === key ? ' **(CURRENT)**' : '';
			statusText += `• **${pkg.name}** - ${pkg.price}${current}\n`;
		}

		statusText += '\n*Package upgrades are managed by bot administrators. Contact support for premium features.*';

		await interaction.reply({
			content: statusText,
			flags: 64
		});
	},
};
