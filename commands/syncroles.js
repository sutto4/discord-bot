const {
	SlashCommandBuilder,
	PermissionFlagsBits
} = require('discord.js');
const syncDonators = require('../jobs/syncDonators');
const { GuildDatabase } = require('../config/database-multi-guild');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('syncroles')
		.setDescription('Manually sync all donator roles from the database.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		console.log('[SYNC CMD] Command started');
		
		// Check if guild has FDG donator sync feature enabled
		const hasFeature = await GuildDatabase.hasFeature(interaction.guild.id, 'fdg_donator_sync');
		if (!hasFeature) {
			return await interaction.reply({
				content: '❌ **FDG Donator Sync is not enabled for this server.**\n\nThis is a premium feature. Contact support to upgrade your package.',
				ephemeral: true
			});
		}
		
		await interaction.deferReply({ ephemeral: true });
		console.log('[SYNC CMD] Deferred reply sent');

		try {
			console.log('[SYNC CMD] Starting manual role sync...');
			const startTime = Date.now();
			
			await syncDonators(interaction.client);
			
			const endTime = Date.now();
			console.log(`[SYNC CMD] Manual role sync completed successfully in ${endTime - startTime}ms`);
			
			console.log('[SYNC CMD] Attempting to edit reply...');
			await interaction.editReply({
				content: '✅ **Role sync completed!** All donator roles have been updated based on the database.'
			});
			console.log('[SYNC CMD] Reply edited successfully');
		} catch (error) {
			console.error('[SYNC CMD] Manual role sync failed:', error);
			
			try {
				console.log('[SYNC CMD] Attempting to edit reply with error...');
				await interaction.editReply({
					content: `❌ **Role sync failed!** Error: ${error.message}`
				});
				console.log('[SYNC CMD] Error reply sent successfully');
			} catch (editError) {
				console.error('[SYNC CMD] Failed to edit reply:', editError);
			}
		}
	}
};
