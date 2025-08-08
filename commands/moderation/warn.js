const { SlashCommandBuilder } = require('discord.js');
const { hasModeratorAccess, logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a member')
		.addUserOption(o => o.setName('target').setDescription('Member to warn').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
		.addStringOption(o => o.setName('duration').setDescription('Optional duration label for logs (e.g., 7d)').setRequired(false)),
	async execute(interaction) {
		if (!await hasModeratorAccess(interaction, 'warn')) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason', true);
		const durationLabel = interaction.options.getString('duration') || null;

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });

		// Best-effort DM
		await targetUser.send(`You were warned in ${interaction.guild.name}: ${reason}`).catch(() => null);

		await logModerationAction(interaction.guild, 'warn', interaction.user, member, reason, durationLabel);
		return interaction.reply({ content: `Warned ${targetUser.tag}.`, ephemeral: true });
	}
};