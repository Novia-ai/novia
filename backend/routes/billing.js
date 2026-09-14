const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');
const stripeService = require('../services/stripeService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const { rows: plans } = await pool.query('SELECT * FROM plans ORDER BY price_cents');
  const { rows: tokenPacks } = await pool.query('SELECT * FROM token_packs ORDER BY price_cents');
  const { rows: purchases } = await pool.query(
    `SELECT tp.tokens_granted, tp.created_at, k.name AS pack_name
     FROM token_purchases tp
     JOIN token_packs k ON k.id = tp.token_pack_id
     WHERE tp.user_id = $1
     ORDER BY tp.created_at DESC
     LIMIT 20`,
    [req.session.userId]
  );

  res.render('dashboard-billing', {
    title: 'NovIA - Facturation',
    account,
    plans,
    tokenPacks,
    purchases,
    error: req.query.error || null,
  });
});

router.post('/checkout/:planKey', requireAuth, async (req, res) => {
  const { rows: planRows } = await pool.query('SELECT * FROM plans WHERE key = $1', [req.params.planKey]);
  const plan = planRows[0];
  if (!plan || !plan.stripe_price_id) {
    return res.redirect('/dashboard/billing?error=plan_non_configure');
  }

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  const user = userRows[0];
  const customerId = await stripeService.getOrCreateCustomer(user);
  if (!user.stripe_customer_id) {
    await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
  }

  const session = await stripeService.createSubscriptionCheckout({
    customerId,
    priceId: plan.stripe_price_id,
    successUrl: `${process.env.APP_BASE_URL}/dashboard/billing?success=1`,
    cancelUrl: `${process.env.APP_BASE_URL}/dashboard/billing?canceled=1`,
    metadata: { user_id: String(user.id), plan_id: String(plan.id) },
  });

  res.redirect(303, session.url);
});

router.post('/token-pack/:packKey', requireAuth, async (req, res) => {
  const { rows: packRows } = await pool.query('SELECT * FROM token_packs WHERE key = $1', [req.params.packKey]);
  const pack = packRows[0];
  if (!pack || !pack.stripe_price_id) {
    return res.redirect('/dashboard/billing?error=pack_non_configure');
  }

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  const user = userRows[0];
  const customerId = await stripeService.getOrCreateCustomer(user);
  if (!user.stripe_customer_id) {
    await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
  }

  const session = await stripeService.createTokenPackCheckout({
    customerId,
    priceId: pack.stripe_price_id,
    successUrl: `${process.env.APP_BASE_URL}/dashboard/billing?success=1`,
    cancelUrl: `${process.env.APP_BASE_URL}/dashboard/billing?canceled=1`,
    metadata: {
      user_id: String(user.id),
      token_pack_id: String(pack.id),
      token_amount: String(pack.token_amount),
    },
  });

  res.redirect(303, session.url);
});

router.post('/autopay', requireAuth, async (req, res) => {
  const { autopay } = req.body;
  const { rows } = await pool.query('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1', [
    req.session.userId,
  ]);
  const sub = rows[0];
  if (sub && sub.stripe_subscription_id) {
    await stripeService.setAutopay(sub.stripe_subscription_id, autopay === 'true');
  }
  res.redirect('/dashboard/billing');
});

module.exports = router;
