const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const { rows: conversations } = await pool.query(
    `SELECT c.id, c.created_at,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.created_at ASC LIMIT 1) AS first_message,
            (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
     FROM conversations c
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [req.session.userId]
  );
  res.render('dashboard-conversations', { titleKey: 'title.conversations', account, conversations });
});

router.get('/:id', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const { rows: convRows } = await pool.query(
    'SELECT id, created_at FROM conversations WHERE id = $1 AND user_id = $2',
    [req.params.id, req.session.userId]
  );
  const conversation = convRows[0];
  if (!conversation) {
    return res.status(404).render('error', { titleKey: 'error.not_found_title', messageKey: 'error.not_found_message' });
  }

  const { rows: messages } = await pool.query(
    'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversation.id]
  );

  res.render('dashboard-conversation-detail', {
    titleKey: 'title.conversations',
    account,
    conversation,
    messages,
  });
});

module.exports = router;
