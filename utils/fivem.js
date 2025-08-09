const { GuildDatabase } = require('../config/database-multi-guild');

async function setServer(guildId, address) {
        if (!guildId) throw new Error('guildId required');
        await GuildDatabase.updateGuildConfig(guildId, { fivem_server: address });
        return address;
}

async function getServer(guildId) {
        if (!guildId) return null;
        const config = await GuildDatabase.getGuildConfig(guildId);
        return config?.fivem_server || null;
}

async function fetchServerData(address) {
        try {
                if (!address) return null;

                // CFX code (no colon) handled via FiveM API
                if (!address.includes(':') && !address.startsWith('http')) {
                        const res = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${address}`);
                        if (!res.ok) return null;
                        const json = await res.json();
                        const info = json?.Data || {};
                        const players = info.players || [];
                        return { info, players };
                }

                const base = address.startsWith('http') ? address : `http://${address}`;
                const [infoRes, playersRes] = await Promise.all([
                        fetch(`${base}/info.json`),
                        fetch(`${base}/players.json`)
                ]);
                if (!infoRes.ok || !playersRes.ok) return null;
                const info = await infoRes.json();
                const players = await playersRes.json();
                return { info, players };
        } catch {
                return null;
        }
}

module.exports = {
        setServer,
        getServer,
        fetchServerData
};