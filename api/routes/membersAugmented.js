// api/routes/membersAugmented.js
const express = require('express');
const { isFeatureEnabled } = require('../lib/features');
const { getMembersAugmented } = require('../services/membersWithGroups');

function membersAugmentedRouter(db) {
	const router = express.Router();

	// New: /api/guilds/:guildId/members-augmented
	router.get('/:guildId/members-augmented', async (req, res) => {
		try {
			const { guildId } = req.params;
			const payload = await getMembersAugmented(db, guildId);
			res.json(payload);
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: 'failed_to_fetch_members_augmented' });
		}
	});

	// New: /api/guilds/:guildId/features
	router.get('/:guildId/features', async (req, res) => {
		try {
			const { guildId } = req.params;
			const enabled = await isFeatureEnabled(db, guildId, 'custom_groups');
			res.json({ guildId, features: { custom_groups: enabled } });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: 'failed_to_fetch_features' });
		}
	});

	return router;
}

module.exports = membersAugmentedRouter;
