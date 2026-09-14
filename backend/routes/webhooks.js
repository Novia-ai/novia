const express = require('express');
const pool = require('../db/pool');
const { stripe } = require('../services/stripeService');
const tokenService = require('../services/tokenService');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook Stripe invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          await activateSubscriptionFromSession(session);
        } else if (session.mode === 'payment') {
          await grantTokenPackFromSession(session);
        }
        break;
      }
      case 'invoice.paid': {
        await renewSubscriptionCycle(event.data.object);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscriptionStatus(event.data.object);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Erreur de traitement du webhook Stripe:', err);
    res.status(500).send('Webhook handler error');
  }
});

async function activateSubscriptionFromSession(session) {
  const userId = session.metadata && session.metadata.user_id;
  const planId = session.metadata && session.metadata.plan_id;
  if (!userId || !planId) return;

  const { rows: planRows } = await pool.query('SELECT monthly_token_limit FROM plans WHERE id = $1', [planId]);
  const monthlyTokenLimit = planRows[0] ? planRows[0].monthly_token_limit : 0;

  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  await pool.query(
    `INSERT INTO subscriptions
       (user_id, plan_id, stripe_subscription_id, status, autopay, current_period_start, current_period_end, tokens_used_current_period, monthly_token_limit)
     VALUES ($1, $2, $3, $4, true, to_timestamp($5), to_timestamp($6), 0, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       plan_id = EXCLUDED.plan_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       tokens_used_current_period = 0,
       monthly_token_limit = EXCLUDED.monthly_token_limit,
       updated_at = now()`,
    [
      userId,
      planId,
      subscription.id,
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      monthlyTokenLimit,
    ]
  );
}

async function grantTokenPackFromSession(session) {
  const userId = session.metadata && session.metadata.user_id;
  const tokenPackId = session.metadata && session.metadata.token_pack_id;
  const tokenAmount = Number((session.metadata && session.metadata.token_amount) || 0);
  if (!userId || !tokenAmount) return;

  await tokenService.grantBonusTokens(userId, tokenAmount);
  await pool.query(
    `INSERT INTO token_purchases (user_id, token_pack_id, tokens_granted, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenPackId, tokenAmount, session.payment_intent]
  );
}

async function renewSubscriptionCycle(invoice) {
  if (!invoice.subscription) return;
  const { rows } = await pool.query('SELECT id FROM subscriptions WHERE stripe_subscription_id = $1', [
    invoice.subscription,
  ]);
  const sub = rows[0];
  if (!sub) return;

  await tokenService.resetCycle(sub.id, new Date(invoice.period_start * 1000), new Date(invoice.period_end * 1000));
}

async function syncSubscriptionStatus(stripeSubscription) {
  await pool.query(
    `UPDATE subscriptions SET status = $1, autopay = $2, updated_at = now() WHERE stripe_subscription_id = $3`,
    [stripeSubscription.status, !stripeSubscription.cancel_at_period_end, stripeSubscription.id]
  );
}

module.exports = router;
