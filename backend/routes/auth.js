const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');

const router = express.Router();

// Freine les essais de mots de passe en rafale : seuls les echecs comptent
// pour la connexion, pour ne jamais bloquer un client qui se connecte bien.
function tooManyAttempts(view, titleKey) {
  return (req, res) => res.status(429).render(view, { titleKey, error: 'auth.error.too_many_attempts' });
}
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  handler: tooManyAttempts('auth/login', 'title.login'),
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  handler: tooManyAttempts('auth/register', 'title.register'),
});

// Nouvel identifiant de session a la connexion (contre la fixation de session).
function startSession(req, userId, done) {
  req.session.regenerate((err) => {
    if (err) return done(err);
    req.session.userId = userId;
    done();
  });
}

router.get('/register', (req, res) => {
  res.render('auth/register', { titleKey: 'title.register', error: null });
});

router.post('/register', registerLimiter, async (req, res, next) => {
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
    startSession(req, rows[0].id, (err) => (err ? next(err) : res.redirect('/dashboard')));
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

router.post('/login', loginLimiter, async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [
      (email || '').toLowerCase().trim(),
    ]);
    const user = rows[0];
    const valid = user && (await bcrypt.compare(password || '', user.password_hash));

    if (!valid) {
      return res.status(400).render('auth/login', { titleKey: 'title.login', error: 'auth.error.invalid_credentials' });
    }

    startSession(req, user.id, (err) => (err ? next(err) : res.redirect('/dashboard')));
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
