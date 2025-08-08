const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Kick a member from the server')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.addUserOption(o => o.setName('target').setDescription('Member to kick').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason for kick').setRequired(false)),
	
	async execute(interaction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason') || 'No reason provided';

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });
		if (!member.kickable) return interaction.reply({ content: 'I cannot kick this member.', ephemeral: true });

		try {
			await member.kick(reason);
			await logModerationAction(interaction.guild, 'kick', interaction.user, member, reason);
			return interaction.reply({ content: `✅ Kicked ${targetUser.tag}.`, ephemeral: true });
		} catch (error) {
			return interaction.reply({ content: 'Failed to kick member.', ephemeral: true });
		}
	}
};