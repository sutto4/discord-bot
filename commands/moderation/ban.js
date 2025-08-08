const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Ban a member from the server')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.addUserOption(o => o.setName('target').setDescription('Member to ban').setRequired(true))
		.addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setMinValue(0).setMaxValue(7))
		.addStringOption(o => o.setName('reason').setDescription('Reason for ban').setRequired(false)),
	
	async execute(interaction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason') || 'No reason provided';
		const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });
		if (!member.bannable) return interaction.reply({ content: 'I cannot ban this member.', ephemeral: true });

		try {
			await member.ban({ reason, deleteMessageDays: deleteDays });
			await logModerationAction(interaction.guild, 'ban', interaction.user, member, reason);
			return interaction.reply({ content: `✅ Banned ${targetUser.tag}.`, ephemeral: true });
		} catch (error) {
			return interaction.reply({ content: 'Failed to ban member.', ephemeral: true });
		}
	}
};