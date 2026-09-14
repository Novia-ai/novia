const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Creer un compte - NovIA', error: null });
});

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || password.length < 8) {
    return res.status(400).render('auth/register', {
      title: 'Creer un compte - NovIA',
      error: 'Email invalide ou mot de passe trop court (8 caracteres minimum).',
    });
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
      return res.status(400).render('auth/register', {
        title: 'Creer un compte - NovIA',
        error: 'Un compte existe deja avec cet email.',
      });
    }
    console.error(err);
    res.status(500).render('auth/register', {
      title: 'Creer un compte - NovIA',
      error: 'Une erreur est survenue, reessayez.',
    });
  }
});

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Connexion - NovIA', error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [
    (email || '').toLowerCase().trim(),
  ]);
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password || '', user.password_hash));

  if (!valid) {
    return res.status(400).render('auth/login', {
      title: 'Connexion - NovIA',
      error: 'Email ou mot de passe incorrect.',
    });
  }

  req.session.userId = user.id;
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
