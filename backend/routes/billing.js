const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');
const stripeService = require('../services/stripeService');
const rateLimit = require('express-rate-limit');
const { normalizeCode } = require('./admin');

const router = express.Router();

// Empeche de deviner des codes promo a la chaine.
const redeemLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const { rows: plans } = await pool.query("SELECT * FROM plans WHERE key != 'demo' ORDER BY price_cents");
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
    titleKey: 'title.billing',
    account,
    plans,
    tokenPacks,
    purchases,
    error: req.query.error || null,
    promoError: req.query.promo_error || null,
    promoSuccess: req.query.promo === 'ok',
    planChanged: req.query.plan_changed === '1',
  });
});

router.post('/checkout/:planKey', requireAuth, async (req, res) => {
  const { rows: planRows } = await pool.query('SELECT * FROM plans WHERE key = $1', [req.params.planKey]);
  const plan = planRows[0];
  if (!plan || !plan.stripe_price_id) {
    return res.redirect('/dashboard/billing?error=plan_non_configure');
  }

  // Deja abonne et payant : on modifie l'abonnement en place, sinon un
  // second abonnement Stripe serait cree et le client paierait les deux.
  const { rows: subRows } = await pool.query(
    "SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = 'active' AND stripe_subscription_id IS NOT NULL",
    [req.session.userId]
  );
  if (subRows[0]) {
    try {
      await stripeService.changeSubscriptionPrice(subRows[0].stripe_subscription_id, plan.stripe_price_id);
    } catch (err) {
      console.error('Changement de forfait Stripe:', err.message);
      return res.redirect('/dashboard/billing?error=changement_forfait');
    }
    await pool.query(
      'UPDATE subscriptions SET plan_id = $1, monthly_token_limit = $2, updated_at = now() WHERE user_id = $3',
      [plan.id, plan.monthly_token_limit, req.session.userId]
    );
    return res.redirect('/dashboard/billing?plan_changed=1');
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

// Code promo : offre des mois d'un forfait, sans carte ni Stripe. Si un
// abonnement offert est deja en cours sur le meme forfait, les mois s'ajoutent.
router.post('/redeem', requireAuth, redeemLimiter, async (req, res) => {
  const code = normalizeCode(req.body.code);
  const userId = req.session.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: codeRows } = await client.query(
      `UPDATE promo_codes SET uses_count = uses_count + 1
       WHERE code = $1 AND uses_count < max_uses
       RETURNING id, plan_id, months`,
      [code]
    );
    const promo = codeRows[0];
    if (!promo) {
      await client.query('ROLLBACK');
      return res.redirect('/dashboard/billing?promo_error=invalid');
    }

    const { rows: subRows } = await client.query(
      `SELECT s.plan_id, s.status, s.stripe_subscription_id, s.free_until, p.key AS plan_key
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = $1`,
      [userId]
    );
    const sub = subRows[0];
    if (sub && sub.status === 'active' && (sub.stripe_subscription_id || sub.plan_key === 'demo')) {
      await client.query('ROLLBACK');
      return res.redirect('/dashboard/billing?promo_error=paid_plan');
    }

    const { rowCount } = await client.query(
      'INSERT INTO promo_redemptions (promo_code_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [promo.id, userId]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.redirect('/dashboard/billing?promo_error=already_used');
    }

    const extending = sub && sub.status === 'active' && sub.free_until && sub.plan_id === promo.plan_id;
    if (extending) {
      await client.query(
        `UPDATE subscriptions SET free_until = free_until + make_interval(months => $1), updated_at = now()
         WHERE user_id = $2`,
        [promo.months, userId]
      );
    } else {
      await client.query(
        `INSERT INTO subscriptions
           (user_id, plan_id, stripe_subscription_id, status, autopay, current_period_start, current_period_end,
            tokens_used_current_period, monthly_token_limit, free_until)
         SELECT $1, p.id, NULL, 'active', false, now(), now() + interval '1 month', 0, p.monthly_token_limit,
                now() + make_interval(months => $3)
         FROM plans p WHERE p.id = $2
         ON CONFLICT (user_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           stripe_subscription_id = NULL,
           status = 'active',
           autopay = false,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           tokens_used_current_period = 0,
           monthly_token_limit = EXCLUDED.monthly_token_limit,
           free_until = EXCLUDED.free_until,
           updated_at = now()`,
        [userId, promo.plan_id, promo.months]
      );
    }
    await client.query('COMMIT');
    res.redirect('/dashboard/billing?promo=ok');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.redirect('/dashboard/billing?promo_error=invalid');
  } finally {
    client.release();
  }
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
