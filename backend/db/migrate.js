require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { PLANS, TOKEN_PACKS, DEMO_PLAN } = require('../config/plans');
const { DEMO_CLIENT_KEY, DEMO_GREETING, DEMO_KNOWLEDGE_BASE } = require('../config/demoAssistant');

async function upsertPlan(plan) {
  await pool.query(
    `INSERT INTO plans (key, name, price_cents, monthly_token_limit, allow_custom_branding, stripe_price_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET
       name = EXCLUDED.name,
       price_cents = EXCLUDED.price_cents,
       monthly_token_limit = EXCLUDED.monthly_token_limit,
       allow_custom_branding = EXCLUDED.allow_custom_branding,
       stripe_price_id = EXCLUDED.stripe_price_id`,
    [
      plan.key,
      plan.name,
      plan.priceCents,
      plan.monthlyTokenLimit,
      plan.allowCustomBranding,
      plan.stripePriceEnv ? process.env[plan.stripePriceEnv] || null : null,
    ]
  );
}

async function seedDemoAccount() {
  if (!process.env.DEMO_ACCOUNT_EMAIL || !process.env.DEMO_ACCOUNT_PASSWORD) {
    console.log('DEMO_ACCOUNT_EMAIL / DEMO_ACCOUNT_PASSWORD non définis : compte de démonstration ignoré.');
    return;
  }

  const email = process.env.DEMO_ACCOUNT_EMAIL.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(process.env.DEMO_ACCOUNT_PASSWORD, 12);

  await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
    [email, passwordHash]
  );

  const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  const demoUserId = userRows[0].id;

  const { rows: planRows } = await pool.query('SELECT id, monthly_token_limit FROM plans WHERE key = $1', ['demo']);
  const demoPlan = planRows[0];

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, autopay, tokens_used_current_period, monthly_token_limit)
     VALUES ($1, $2, 'active', false, 0, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [demoUserId, demoPlan.id, demoPlan.monthly_token_limit]
  );

  await pool.query(
    `INSERT INTO widget_configs (user_id, client_key, bot_name, greeting_message, knowledge_base)
     VALUES ($1, $2, 'NovIA', $3, $4)
     ON CONFLICT (user_id) DO NOTHING`,
    [demoUserId, DEMO_CLIENT_KEY, DEMO_GREETING, DEMO_KNOWLEDGE_BASE]
  );

  console.log(`Compte de démonstration prêt (client_key: ${DEMO_CLIENT_KEY}).`);
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  for (const plan of PLANS) {
    await upsertPlan(plan);
  }
  await upsertPlan(DEMO_PLAN);

  for (const pack of TOKEN_PACKS) {
    await pool.query(
      `INSERT INTO token_packs (key, name, price_cents, token_amount, stripe_price_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name,
         price_cents = EXCLUDED.price_cents,
         token_amount = EXCLUDED.token_amount,
         stripe_price_id = EXCLUDED.stripe_price_id`,
      [pack.key, pack.name, pack.priceCents, pack.tokenAmount, process.env[pack.stripePriceEnv] || null]
    );
  }

  await seedDemoAccount();

  console.log('Migration et seed des forfaits terminés.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Erreur de migration:', err);
  process.exit(1);
});
