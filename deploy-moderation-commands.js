require('dotenv').config();
const { REST, Routes } = require('discord.js');
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
	host: process.env.BOT_DB_HOST,
	user: process.env.BOT_DB_USER,
	password: process.env.BOT_DB_PASSWORD,
	database: process.env.BOT_DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
};

// Load moderation slash commands
const commands = [];
const commandsPath = require('path').join(__dirname, 'commands');

const moderationCommands = [
	'ban.js',
	'unban.js', 
	'mute.js',
	'unmute.js',
	'kick.js',
	'warn.js',
	'case.js',
	'moderation.js'
];

for (const file of moderationCommands) {
	const filePath = require('path').join(commandsPath, file);
	if (require('fs').existsSync(filePath)) {
		const command = require(filePath);
		commands.push(command.data.toJSON());
		console.log(`📦 Loaded command: ${command.data.name}`);
	} else {
		console.warn(`⚠️  Command file not found: ${file}`);
	}
}

const rest = new REST().setToken(process.env.TOKEN);

async function getGuildsWithModerationFeature() {
	let connection;
	try {
		connection = await mysql.createConnection(dbConfig);
		
		// Get guilds that have the moderation feature enabled
		const [rows] = await connection.execute(`
			SELECT DISTINCT g.guild_id, g.guild_name, gf.enabled
			FROM guilds g
			JOIN guild_features gf ON g.guild_id = gf.guild_id
			WHERE gf.feature_key = 'moderation' 
			AND gf.enabled = 1
			AND g.status = 'active'
		`);
		
		return rows;
	} catch (error) {
		console.error('❌ Database error:', error);
		return [];
	} finally {
		if (connection) {
			connection.end();
		}
	}
}

async function deployToSpecificGuilds(targetGuilds) {
	console.log(`🚀 Starting deployment to ${targetGuilds.length} guilds with moderation feature enabled...`);
	
	let successCount = 0;
	let errorCount = 0;
	
	for (const guild of targetGuilds) {
		try {
			console.log(`📤 Deploying to: ${guild.guild_name} (${guild.guild_id})`);
			
			await rest.put(
				Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.guild_id),
				{ body: commands }
			);
			
			console.log(`✅ Successfully deployed to: ${guild.guild_name}`);
			successCount++;
			
			// Small delay to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 1000));
			
		} catch (error) {
			console.error(`❌ Failed to deploy to ${guild.guild_name}:`, error.message);
			errorCount++;
		}
	}
	
	return { successCount, errorCount };
}

async function deployToAllGuilds() {
	try {
		console.log('📋 Fetching all guilds from Discord...');
		const guilds = await rest.get(Routes.oauth2Guilds());
		
		console.log(`🚀 Starting deployment to all ${guilds.length} guilds...`);
		
		let successCount = 0;
		let errorCount = 0;
		
		for (const guild of guilds) {
			try {
				console.log(`📤 Deploying to: ${guild.name} (${guild.id})`);
				
				await rest.put(
					Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
					{ body: commands }
				);
				
				console.log(`✅ Successfully deployed to: ${guild.name}`);
				successCount++;
				
				// Small delay to avoid rate limiting
				await new Promise(resolve => setTimeout(resolve, 1000));
				
			} catch (error) {
				console.error(`❌ Failed to deploy to ${guild.name}:`, error.message);
				errorCount++;
			}
		}
		
		return { successCount, errorCount };
	} catch (error) {
		console.error('❌ Error fetching guilds:', error);
		return { successCount: 0, errorCount: 1 };
	}
}

async function main() {
	try {
		console.log(`🎯 Moderation Commands Deployment - Feature-Aware`);
		console.log(`📦 Commands to deploy: ${commands.length}`);
		console.log('=' .repeat(50));
		
		// Check command line arguments
		const args = process.argv.slice(2);
		const deployToAll = args.includes('--all');
		const dryRun = args.includes('--dry-run');
		
		if (dryRun) {
			console.log('🔍 DRY RUN MODE - No actual deployment will occur');
		}
		
		let targetGuilds = [];
		let deploymentType = '';
		
		if (deployToAll) {
			// Deploy to all guilds
			deploymentType = 'all guilds';
			if (!dryRun) {
				const result = await deployToAllGuilds();
				console.log(`\n📊 Deployment Summary:`);
				console.log(`✅ Successful: ${result.successCount}`);
				console.log(`❌ Failed: ${result.errorCount}`);
			} else {
				console.log('🔍 Would deploy to all guilds (dry run)');
			}
		} else {
			// Deploy only to guilds with moderation feature
			deploymentType = 'feature-enabled guilds only';
			targetGuilds = await getGuildsWithModerationFeature();
			
			if (targetGuilds.length === 0) {
				console.log('⚠️  No guilds found with moderation feature enabled');
				return;
			}
			
			console.log(`🎯 Found ${targetGuilds.length} guilds with moderation feature enabled:`);
			targetGuilds.forEach(guild => {
				console.log(`   • ${guild.guild_name} (${guild.guild_id})`);
			});
			
			if (!dryRun) {
				const result = await deployToSpecificGuilds(targetGuilds);
				console.log(`\n📊 Deployment Summary:`);
				console.log(`✅ Successful: ${result.successCount}`);
				console.log(`❌ Failed: ${result.errorCount}`);
			} else {
				console.log('🔍 Would deploy to feature-enabled guilds (dry run)');
			}
		}
		
		console.log(`\n🎉 Deployment to ${deploymentType} completed!`);
		
	} catch (error) {
		console.error('❌ Deployment failed:', error);
		process.exit(1);
	}
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`
🎯 Moderation Commands Deployment - Feature-Aware

Usage: node deploy-moderation-commands.js [options]

Options:
  --feature-only    Deploy only to guilds with moderation feature enabled (default)
  --all            Deploy to all guilds the bot is in
  --dry-run        Show what would be deployed without actually deploying
  --help, -h       Show this help message

Examples:
  node deploy-moderation-commands.js                    # Deploy to feature-enabled guilds
  node deploy-moderation-commands.js --all             # Deploy to all guilds
  node deploy-moderation-commands.js --dry-run         # Preview deployment
  node deploy-moderation-commands.js --all --dry-run   # Preview all-guild deployment
`);
	process.exit(0);
}

main();
