const fetch = require('node-fetch');

async function sendSystemLog(payload) {
  const baseUrl = process.env.WEBAPP_BASE_URL; // e.g., https://yourapp.com or http://localhost:3000
  const secret = process.env.SYSTEM_EVENTS_SECRET;

  if (!baseUrl || !secret) {
    // Silently skip if not configured
    return false;
  }

  try {
    const res = await fetch(`${baseUrl}/api/system-events/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-system-secret': secret
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('[BOT->SYSTEM-LOG] Failed to send log:', err.message);
    return false;
  }
}

function buildBasePayload(guild, user) {
  return {
    guildId: guild?.id || 'system',
    userId: user?.id || 'system',
    userName: user?.tag || user?.username || 'Bot',
    userRole: 'bot'
  };
}

async function logCommand(guild, user, commandName, args, status = 'success', errorMessage) {
  const payload = {
    ...buildBasePayload(guild, user),
    actionType: 'api_access',
    actionName: 'bot_command',
    targetType: 'command',
    targetId: commandName,
    targetName: commandName,
    newValue: { args },
    status,
    errorMessage
  };
  return sendSystemLog(payload);
}

async function logAction(guild, user, actionName, details, status = 'success', errorMessage) {
  const payload = {
    ...buildBasePayload(guild, user),
    actionType: 'moderation_action',
    actionName,
    targetType: 'guild',
    targetId: guild?.id,
    targetName: guild?.name,
    newValue: details,
    status,
    errorMessage
  };
  return sendSystemLog(payload);
}

module.exports = {
  sendSystemLog,
  logCommand,
  logAction,
};


