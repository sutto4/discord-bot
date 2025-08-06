const db = require('../config/database');
const { donatorRoleMapping } = require('../config/roles');
const applyDonatorRole = require('../helpers/applyDonatorRole');

module.exports = {
	name: 'guildMemberAdd',
	async execute(member, client) {
		await applyDonatorRole(member, db, donatorRoleMapping);
	},
};