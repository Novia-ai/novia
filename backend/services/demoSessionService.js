const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;
const MAX_MESSAGES_PER_SESSION = 12;

const sessions = new Map();

function createSession(url, knowledgeBase) {
  const id = crypto.randomBytes(12).toString('hex');
  sessions.set(id, {
    url,
    knowledgeBase,
    messageCount: 0,
    history: [],
    expiresAt: Date.now() + TTL_MS,
  });
  return id;
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function recordExchange(id, userMessage, botReply) {
  const session = sessions.get(id);
  if (!session) return;
  session.messageCount += 1;
  session.history.push({ role: 'user', content: userMessage });
  session.history.push({ role: 'assistant', content: botReply });
  if (session.history.length > 12) {
    session.history = session.history.slice(-12);
  }
}

function canSendMessage(id) {
  const session = getSession(id);
  if (!session) return false;
  return session.messageCount < MAX_MESSAGES_PER_SESSION;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

module.exports = { createSession, getSession, recordExchange, canSendMessage, MAX_MESSAGES_PER_SESSION };
