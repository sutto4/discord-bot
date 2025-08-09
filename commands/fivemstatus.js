const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServer, fetchServerData } = require('../utils/fivem');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fivemstatus')
		.setDescription('Display status of the configured FiveM server'),
	async execute(interaction) {
		const address = await getServer(interaction.guild.id);
		if (!address) {
			return interaction.reply({
				content: '❌ No FiveM server configured. Use `/setfivemserver` first.',
				flags: 64
			});
		}

		const data = await fetchServerData(address);
		if (!data) {
			return interaction.reply({
				content: `❌ Unable to reach server \`${address}\`.`,
				flags: 64
			});
		}

		const { info, players } = data;
		const vars = info?.vars || {};

		// Basic info
		const name = info?.hostname || vars.sv_projectName || vars.sv_hostname || 'Unknown';
		const desc = vars.sv_projectDesc || 'No description';
		const count = Array.isArray(players) ? players.length : (info?.clients ?? 0);
		const max = info?.sv_maxClients || vars.sv_maxClients || count;
		const reserved = vars.sv_reservedslots || 0;
		const version = String(info?.version ?? 'Unknown');
		const map = String(info?.mapname ?? vars.mapname ?? vars.AOP ?? 'Unknown');
		const gametype = String(info?.gametype ?? vars.gamename ?? 'Unknown');
		const build = vars.sv_enforceGameBuild || 'Unknown';
		const uptime = vars.Uptime || 'Unknown'; // Already in hours/min from your info.json

		const embed = new EmbedBuilder()
			.setTitle(name)
			.setDescription(desc)
			.setColor(0x2ecc71)
			.addFields(
				{ name: 'Status', value: 'Online', inline: true },
				{ name: 'Players', value: `${count}/${max}`, inline: true },
				{ name: 'Reserved Slots', value: String(reserved), inline: true },
				{ name: 'Uptime', value: uptime, inline: true },
				{ name: 'Version', value: version, inline: true },
				{ name: 'Game Build', value: String(build), inline: true },
				{ name: 'Map / AOP', value: map, inline: true },
				{ name: 'Game Type', value: gametype, inline: true },
				{ name: 'Direct Connect', value: `fivem://connect/${address}`, inline: false }
			)
			.setTimestamp();

		await interaction.reply({
			embeds: [embed],
			flags: 64
		});
	},
};
