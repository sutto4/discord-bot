const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../data/fivem_servers.json');

function loadConfig() {
        try {
                if (!fs.existsSync(configPath)) return {};
                const raw = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(raw || '{}') || {};
        } catch {
                return {};
        }
}

function saveConfig(config) {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function setServer(guildId, address) {
        const config = loadConfig();
        config[guildId] = address;
        saveConfig(config);
}

function getServer(guildId) {
        const config = loadConfig();
        return config[guildId] || null;
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

