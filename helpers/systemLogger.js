const fetch = require('node-fetch');

async function sendSystemLog(payload) {
  // Use the same API_BASE as guild events for consistency
  const baseUrl = process.env.API_BASE || process.env.WEBAPP_BASE_URL;
  const secret = process.env.SYSTEM_EVENTS_SECRET;

  if (!baseUrl || !secret) {
    console.warn('[BOT->SYSTEM-LOG] Skipping system log - missing env vars:', {
      hasBaseUrl: !!baseUrl,
      hasSecret: !!secret,
      baseUrl: baseUrl || 'undefined',
      secretLength: secret ? secret.length : 0
    });
    return false;
  }

  try {
    console.log('[BOT->SYSTEM-LOG] Sending log to:', `${baseUrl}/api/system-events/log`);
    const res = await fetch(`${baseUrl}/api/system-events/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-system-secret': secret
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      console.log('[BOT->SYSTEM-LOG] Successfully sent log:', payload.actionName);
    } else {
      console.warn('[BOT->SYSTEM-LOG] Failed to send log:', res.status, res.statusText);
    }
    
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


