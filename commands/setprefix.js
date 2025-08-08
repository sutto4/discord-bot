const { SlashCommandBuilder } = require('discord.js');
const db = require('../config/database-multi-guild');
const hasFeature = require('../utils/premium');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setprefix')
		.setDescription('Set a custom dot command prefix for this server')
		.addStringOption(option =>
			option.setName('prefix')
				.setDescription('The new prefix (e.g. . ! ?)')
				.setRequired(true)
		),
	async execute(interaction) {
		const guildId = interaction.guild.id;
		const newPrefix = interaction.options.getString('prefix');

		// Check premium feature access
		const isPremium = await hasFeature(guildId, 'custom_prefix');
		if (!isPremium) {
			return await interaction.reply({
				content: '❌ This is a premium feature. Upgrade to unlock it.',
				ephemeral: true
			});
		}

		try {
			await db.query(`
				UPDATE guilds
				SET custom_prefix = ?
				WHERE guild_id = ?
			`, [newPrefix, guildId]);

			await interaction.reply(`✅ Custom prefix updated to \`${newPrefix}\``);
		} catch (err) {
			console.error('[PREFIX UPDATE ERROR]', err);
			await interaction.reply({
				content: '❌ Failed to update prefix.',
				ephemeral: true
			});
		}
	}
};
