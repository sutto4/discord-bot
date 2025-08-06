const {
	SlashCommandBuilder,
	PermissionFlagsBits
} = require('discord.js');
const syncDonators = require('../jobs/syncDonators');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('syncroles')
		.setDescription('Manually sync all donator roles from the database.')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		console.log('[SYNC CMD] Command started');
		await interaction.deferReply({ flags: 64 });
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
