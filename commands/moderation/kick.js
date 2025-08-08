const { SlashCommandBuilder } = require('discord.js');
const { hasModeratorAccess, logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Kick a member')
		.addUserOption(o => o.setName('target').setDescription('Member to kick').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
		.addStringOption(o => o.setName('duration').setDescription('Optional duration label for logs (e.g., 1d)').setRequired(false)),
	async execute(interaction) {
		if (!await hasModeratorAccess(interaction, 'kick')) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason') || 'No reason provided';
		const durationLabel = interaction.options.getString('duration') || null;

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });
		if (!member.kickable) return interaction.reply({ content: 'I cannot kick this member.', ephemeral: true });

		await member.kick(reason).catch(() => null);
		await logModerationAction(interaction.guild, 'kick', interaction.user, member, reason, durationLabel);
		return interaction.reply({ content: `Kicked ${targetUser.tag}.`, ephemeral: true });
	}
};