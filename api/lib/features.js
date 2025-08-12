// api/lib/features.js
const isFeatureEnabled = async (db, guildId, featureName) => {
	const [rows] = await db.query(
		`SELECT enabled
		   FROM guild_features
		  WHERE guild_id = ? AND feature_name = ?
		  LIMIT 1`,
		[guildId, featureName]
	);
	if (!rows || rows.length === 0) return false;
	return String(rows[0].enabled) === '1';
};

module.exports = { isFeatureEnabled };
