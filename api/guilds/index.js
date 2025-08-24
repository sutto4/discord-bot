const express = require('express');
const router = express.Router();

// Import guild-specific route modules
const enablePremium = require('./[guildId]/enable-premium/route');

// Mount guild-specific routes
router.use('/:guildId', enablePremium);

module.exports = router;
