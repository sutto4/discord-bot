const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { parseDuration, logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mute')
		.setDescription('Timeout a member')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.addUserOption(o => o.setName('target').setDescription('Member to mute').setRequired(true))
		.addStringOption(o => o.setName('duration').setDescription('Duration (e.g., 10m, 2h, 1d)').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
	async execute(interaction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const durationStr = interaction.options.getString('duration', true);
		const reason = interaction.options.getString('reason') || 'No reason provided';

		const ms = parseDuration(durationStr);
		if (!ms) return interaction.reply({ content: 'Invalid duration. Use formats like 10m, 2h, 1d.', ephemeral: true });

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });
		if (!member.moderatable) return interaction.reply({ content: 'I cannot mute this member.', ephemeral: true });

		await member.timeout(ms, reason).catch(() => null);
		await logModerationAction(interaction.guild, 'mute', interaction.user, member, reason, durationStr);
		return interaction.reply({ content: `Muted ${targetUser.tag} for ${durationStr}.`, ephemeral: true });
	}
};