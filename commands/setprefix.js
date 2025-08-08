const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isValidPrefix, setGuildPrefix, getGuildPrefix } = require('../utils/prefix');
const { hasFeature } = require('../utils/premium');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setprefix')
		.setDescription('Set the message command prefix for this server (requires premium).')
		.addStringOption(opt =>
			opt.setName('prefix')
				.setDescription('New prefix (1–5 visible characters, e.g., ., !, ?)')
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const guildId = interaction.guild?.id;
		if (!guildId) {
			return interaction.reply({ content: 'Guild-only command.', ephemeral: true });
		}

		const isPremium = await hasFeature(guildId, 'prefix');
		if (!isPremium) {
			const current = await getGuildPrefix(guildId);
			return interaction.reply({
				content: `❌ This server does not have access to custom prefixes.\nCurrent prefix: \`${current}\``,
				ephemeral: true
			});
		}

		const requested = interaction.options.getString('prefix', true);
		if (!isValidPrefix(requested)) {
			return interaction.reply({
				content: '❌ Invalid prefix. Use 1–5 visible characters (no spaces). Examples: ".", "!", ">>".',
				ephemeral: true
			});
		}

		await setGuildPrefix(guildId, requested);
		return interaction.reply({
			content: `✅ Prefix updated to \`${requested}\`.`,
			ephemeral: true
		});
	}
};
