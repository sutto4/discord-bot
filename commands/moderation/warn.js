const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../../utils/moderation');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Issue a warning to a member')
		.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
		.addUserOption(o => o.setName('target').setDescription('Member to warn').setRequired(true))
		.addStringOption(o => o.setName('reason').setDescription('Warning reason').setRequired(true)),
	
	async execute(interaction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
			return interaction.reply({ content: 'You do not have permission for this command.', ephemeral: true });
		}

		const targetUser = interaction.options.getUser('target', true);
		const reason = interaction.options.getString('reason', true);

		const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) return interaction.reply({ content: 'Member not found.', ephemeral: true });

		// Try to DM the user
		try {
			await targetUser.send(`⚠️ You received a warning in **${interaction.guild.name}**: ${reason}`);
		} catch (error) {
			// User has DMs disabled or blocked the bot
		}

		await logModerationAction(interaction.guild, 'warn', interaction.user, member, reason);
		return interaction.reply({ content: `✅ Warned ${targetUser.tag}.`, ephemeral: true });
	}
};