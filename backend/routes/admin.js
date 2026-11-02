const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

async function requireAdmin(req, res, next) {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
  if (!rows[0] || !rows[0].is_admin) return res.status(404).render('error', { titleKey: 'error.not_found_title', messageKey: 'error.not_found_message' });
  next();
}

router.use(requireAuth, requireAdmin);

// Sans 0/O ni 1/I, pour qu'un code dicte ou recopie a la main reste lisible.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (const b of bytes) suffix += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `NOVIA-${suffix}`;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isValidCode(code) {
  return /^[A-Z0-9-]{4,30}$/.test(code);
}

function normalizeSiteUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch (err) {
    return null;
  }
}

router.get('/', async (req, res) => {
  const { rows: plans } = await pool.query("SELECT id, key FROM plans WHERE key != 'demo' ORDER BY price_cents");
  const { rows: codes } = await pool.query(
    `SELECT c.id, c.code, c.months, c.max_uses, c.uses_count, c.note, c.created_at, p.key AS plan_key,
            COALESCE(string_agg(u.email, ', ' ORDER BY r.created_at), '') AS redeemed_by
     FROM promo_codes c
     JOIN plans p ON p.id = c.plan_id
     LEFT JOIN promo_redemptions r ON r.promo_code_id = c.id
     LEFT JOIN users u ON u.id = r.user_id
     GROUP BY c.id, p.key
     ORDER BY c.created_at DESC`
  );
  const { rows: sites } = await pool.query('SELECT id, name, url FROM showcase_sites ORDER BY created_at');

  res.render('dashboard-admin', {
    titleKey: 'title.admin',
    plans,
    codes,
    sites,
    error: req.query.error || null,
    created: req.query.created || null,
  });
});

router.post('/codes', async (req, res) => {
  const code = normalizeCode(req.body.code) || generateCode();
  const months = parseInt(req.body.months, 10);
  const planId = parseInt(req.body.plan_id, 10);
  const note = String(req.body.note || '').trim().slice(0, 200);

  if (!isValidCode(code) || !(months >= 1 && months <= 24)) {
    return res.redirect('/dashboard/admin?error=invalid_code');
  }
  const { rows: planRows } = await pool.query("SELECT id FROM plans WHERE id = $1 AND key != 'demo'", [planId]);
  if (!planRows[0]) return res.redirect('/dashboard/admin?error=invalid_code');

  try {
    // Chaque code ne sert qu'une seule fois : un code par personne.
    await pool.query('INSERT INTO promo_codes (code, plan_id, months, max_uses, note) VALUES ($1, $2, $3, 1, $4)', [
      code,
      planId,
      months,
      note,
    ]);
  } catch (err) {
    if (err.code === '23505') return res.redirect('/dashboard/admin?error=code_exists');
    console.error(err);
    return res.redirect('/dashboard/admin?error=invalid_code');
  }
  res.redirect(`/dashboard/admin?created=${encodeURIComponent(code)}`);
});

// Supprimer un code empeche les nouvelles utilisations ; les mois deja
// offerts restent acquis (ils sont portes par l'abonnement, pas par le code).
router.post('/codes/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM promo_codes WHERE id = $1', [req.params.id]);
  res.redirect('/dashboard/admin');
});

router.post('/showcase', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const url = normalizeSiteUrl(req.body.url);
  if (!name || !url) return res.redirect('/dashboard/admin?error=invalid_site');
  await pool.query('INSERT INTO showcase_sites (name, url) VALUES ($1, $2)', [name, url]);
  res.redirect('/dashboard/admin#showcase');
});

router.post('/showcase/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM showcase_sites WHERE id = $1', [req.params.id]);
  res.redirect('/dashboard/admin#showcase');
});

module.exports = { router, normalizeCode };
