const {
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits
} = require('discord.js');
const { verifyRoleId } = require('../config/roles');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sendverify')
		.setDescription('Send the verification button message.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const embed = new EmbedBuilder()
			.setTitle('🛡️ Verify to Access the Server')
			.setDescription('Click the **Verify** button below to confirm you are a human and unlock the rest of the server.')
			.setColor(0x00FF99);

		const button = new ButtonBuilder()
			.setCustomId('verify_button')
			.setLabel('✅ Verify')
			.setStyle(ButtonStyle.Success);

		const row = new ActionRowBuilder().addComponents(button);

		await interaction.reply({ embeds: [embed], components: [row] });
	}
};