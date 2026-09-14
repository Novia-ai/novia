const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard', { titleKey: 'title.dashboard', account });
});

router.get('/account', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard-account', { titleKey: 'title.account', account, message: null, error: null });
});

router.post('/account/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
  const valid = rows[0] && (await bcrypt.compare(currentPassword || '', rows[0].password_hash));
  const account = await getAccountContext(req.session.userId);

  if (!valid) {
    return res.status(400).render('dashboard-account', {
      titleKey: 'title.account',
      account,
      message: null,
      error: 'account.wrong_current_password',
    });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).render('dashboard-account', {
      titleKey: 'title.account',
      account,
      message: null,
      error: 'account.password_too_short',
    });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.session.userId]);
  res.render('dashboard-account', {
    titleKey: 'title.account',
    account,
    message: 'account.password_updated',
    error: null,
  });
});

module.exports = router;
