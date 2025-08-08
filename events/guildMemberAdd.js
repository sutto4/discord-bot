const { fivemDb } = require('../config/database');
const { GuildDatabase } = require('../config/database-multi-guild');
const { donatorRoleMapping } = require('../config/roles');
const applyDonatorRole = require('../helpers/applyDonatorRole');

module.exports = {
	name: 'guildMemberAdd',
	async execute(member, client) {
		// Initialize guild in database if not exists
		await GuildDatabase.initializeGuild(member.guild.id, member.guild.name);
		
		// Apply donator role if applicable
		await applyDonatorRole(member, fivemDb, donatorRoleMapping);
	},
};