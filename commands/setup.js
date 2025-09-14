const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('Get started with ServerMate setup and configuration')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		try {
			// Create setup embed
			const setupEmbed = new EmbedBuilder()
				.setColor(0x5865F2) // Discord blurple
				.setTitle('🚀 ServerMate Setup')
				.setDescription('Welcome to ServerMate! Let\'s get your server configured.')
				.addFields(
					{
						name: '📋 Quick Setup Steps',
						value: '1. **Set Role Permissions** - Configure who can access the web app\n' +
							   '2. **Enable Features** - Turn on the features you want to use\n' +
							   '3. **Configure Commands** - Set up individual command permissions\n' +
							   '4. **Set Modlog Channel** - Choose where system messages appear',
						inline: false
					},
					{
						name: '🔗 Web Dashboard',
						value: `[Open Server Settings](${process.env.WEB_APP_URL || 'http://localhost:3000'}/guilds/${interaction.guild.id}/settings)`,
						inline: false
					},
					{
						name: '💡 Need Help?',
						value: '• Use `/help` for command information\n' +
							   '• Check the web dashboard for detailed configuration\n' +
							   '• Contact support if you need assistance',
						inline: false
					}
				)
				.setFooter({ 
					text: 'ServerMate Setup Assistant',
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			// Send DM to the user
			try {
				await interaction.user.send({ embeds: [setupEmbed] });
				await interaction.reply({ 
					content: '✅ I\'ve sent you a DM with setup instructions and a direct link to your server settings!', 
					ephemeral: true 
				});
			} catch (dmError) {
				// If DM fails, send in channel
				await interaction.reply({ 
					content: `✅ Setup instructions sent! [Open Server Settings](${process.env.WEB_APP_URL || 'http://localhost:3000'}/guilds/${interaction.guild.id}/settings)`, 
					ephemeral: true 
				});
			}

		} catch (error) {
			console.error('Setup command error:', error);
			await interaction.reply({ 
				content: '❌ An error occurred while sending setup instructions. Please try again later.', 
				ephemeral: true 
			});
		}
	},
};
