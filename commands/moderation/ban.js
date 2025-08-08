const { SlashCommandBuilder } = require('discord.js');
const { hasModeratorAccess, logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Ban a member')
		.addUserOption(o => o.setName('target').setDescription('Member to ban').setRequired(true))
		.addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setMinValue(0).setMaxValue(7))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
		.addStringOption(o => o.setName('duration').setDescription('Optional duration label for logs (e.g., 3d)').setRequired(false)),
	async execute(interaction) {
		if (!await hasModeratorAccess(interaction, 'ban')) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason') || 'No reason provided';
		const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
		const durationLabel = interaction.options.getString('duration') || null;

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });
		if (!member.bannable) return interaction.reply({ content: 'I cannot ban this member.', ephemeral: true });

		await member.ban({ reason, deleteMessageDays: deleteDays }).catch(() => null);
		// Note: durationLabel is for logs only. Implement scheduled unban if desired.
		await logModerationAction(interaction.guild, 'ban', interaction.user, member, reason, durationLabel);
		return interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: true });
	}
};