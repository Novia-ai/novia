const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard', { title: 'NovIA - Tableau de bord', account });
});

router.get('/account', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard-account', { title: 'NovIA - Compte', account, message: null, error: null });
});

router.post('/account/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
  const valid = rows[0] && (await bcrypt.compare(currentPassword || '', rows[0].password_hash));
  const account = await getAccountContext(req.session.userId);

  if (!valid) {
    return res.status(400).render('dashboard-account', {
      title: 'NovIA - Compte',
      account,
      message: null,
      error: 'Mot de passe actuel incorrect.',
    });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).render('dashboard-account', {
      title: 'NovIA - Compte',
      account,
      message: null,
      error: 'Le nouveau mot de passe doit contenir au moins 8 caracteres.',
    });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.session.userId]);
  res.render('dashboard-account', {
    title: 'NovIA - Compte',
    account,
    message: 'Mot de passe mis a jour.',
    error: null,
  });
});

module.exports = router;
