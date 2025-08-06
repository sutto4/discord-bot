require('dotenv').config();

module.exports = {
	donatorRoleMapping: {
		T1: 'Tier 1 Supporter',
		T2: 'Tier 2 Supporter',
		T3: 'Fat Duck Family'
	},
	verifyRoleId: process.env.VERIFY_ROLE_ID, // role to assign after verification
};
