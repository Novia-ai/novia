const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('auth/register', { titleKey: 'title.register', error: null });
});

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 8) {
    return res.status(400).render('auth/register', { titleKey: 'title.register', error: 'auth.error.invalid_signup' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [
      email.toLowerCase().trim(),
      passwordHash,
    ]);
    req.session.userId = rows[0].id;
    res.redirect('/dashboard');
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).render('auth/register', { titleKey: 'title.register', error: 'auth.error.account_exists' });
    }
    console.error(err);
    res.status(500).render('auth/register', { titleKey: 'title.register', error: 'auth.error.generic' });
  }
});

router.get('/login', (req, res) => {
  res.render('auth/login', { titleKey: 'title.login', error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [
    (email || '').toLowerCase().trim(),
  ]);
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password || '', user.password_hash));

  if (!valid) {
    return res.status(400).render('auth/login', { titleKey: 'title.login', error: 'auth.error.invalid_credentials' });
  }

  req.session.userId = user.id;
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
