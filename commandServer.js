const http = require('http');
const { CommandManager } = require('./commandManager');

class CommandServer {
  constructor(commandManager, port = 3001) {
    this.commandManager = commandManager;
    this.port = port;
    this.server = null;
  }

  start() {
    // Check if server is already running
    if (this.server && this.server.listening) {
      console.log(`[COMMAND-SERVER] Command server is already running on port ${this.port}`);
      return;
    }

    this.server = http.createServer(async (req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          port: this.port 
        }));
        return;
      }

      if (req.method === 'POST' && req.url === '/commands') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const { guildId, action, features } = data;

            console.log(`[COMMAND-SERVER] Received command update:`, { guildId, action, features });

            if (!guildId || !action || !features) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }

            // Update commands for the guild
            const result = await this.commandManager.updateGuildCommands(guildId, features);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, result }));

          } catch (error) {
            console.error('[COMMAND-SERVER] Error processing command update:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      } else if (req.method === 'GET' && req.url.startsWith('/commands')) {
        // Parse guildId from query string
        const url = new URL(req.url, `http://${req.headers.host}`);
        const guildId = url.searchParams.get('guildId');

        if (!guildId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing guildId parameter' }));
          return;
        }

        try {
          // Get current commands for the guild
          const commands = this.commandManager.getGuildCommands(guildId);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, guildId, commands }));

        } catch (error) {
          console.error('[COMMAND-SERVER] Error getting commands:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[COMMAND-SERVER] Command server listening on port ${this.port}`);
    }).on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[COMMAND-SERVER] Port ${this.port} is already in use. Command server will not start.`);
        console.error(`[COMMAND-SERVER] This might be due to another instance running or a different service using the port.`);
        console.error(`[COMMAND-SERVER] The bot will continue running without the command server.`);
      } else {
        console.error(`[COMMAND-SERVER] Failed to start command server:`, error);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[COMMAND-SERVER] Command server stopped');
    }
  }

  isRunning() {
    return this.server && this.server.listening;
  }
}

module.exports = { CommandServer };
