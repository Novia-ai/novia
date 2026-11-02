const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');
const stripeService = require('../services/stripeService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard', { titleKey: 'title.dashboard', account });
});

router.get('/account', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  res.render('dashboard-account', { titleKey: 'title.account', account, message: null, error: null, deleteError: null });
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

// Suppression definitive du compte (droit a l'effacement, Loi 25) : annule
// l'abonnement Stripe, supprime le logo televerse, puis l'utilisateur ; les
// conversations, prospects, config du widget, etc. suivent par ON DELETE CASCADE.
// Les factures restent chez Stripe, qui les conserve pour nos obligations fiscales.
router.post('/account/delete', requireAuth, async (req, res) => {
  const { password, confirm } = req.body;
  const userId = req.session.userId;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const valid = rows[0] && (await bcrypt.compare(password || '', rows[0].password_hash));

  if (!valid || confirm !== 'yes') {
    const account = await getAccountContext(userId);
    return res.status(400).render('dashboard-account', {
      titleKey: 'title.account',
      account,
      message: null,
      error: null,
      deleteError: !valid ? 'account.wrong_current_password' : 'account.delete_confirm_required',
    });
  }

  const { rows: subRows } = await pool.query(
    "SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL AND status <> 'canceled'",
    [userId]
  );
  try {
    for (const sub of subRows) {
      await stripeService.cancelSubscription(sub.stripe_subscription_id);
    }
  } catch (err) {
    // Ne pas supprimer le compte si l'abonnement n'a pas pu etre annule :
    // le client continuerait d'etre facture sans plus pouvoir se connecter.
    console.error('Annulation Stripe impossible lors de la suppression du compte:', err);
    const account = await getAccountContext(userId);
    return res.status(500).render('dashboard-account', {
      titleKey: 'title.account',
      account,
      message: null,
      error: null,
      deleteError: 'account.delete_stripe_error',
    });
  }

  const { rows: configRows } = await pool.query('SELECT logo_path FROM widget_configs WHERE user_id = $1', [userId]);
  const logoPath = configRows[0] && configRows[0].logo_path;
  if (logoPath && logoPath.startsWith('/uploads/logos/')) {
    fs.unlink(path.join(__dirname, '..', '..', 'public', logoPath), () => {});
  }

  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  req.session.destroy(() => res.redirect('/?account_deleted=1'));
});

module.exports = router;
