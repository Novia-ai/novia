require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { PLANS, TOKEN_PACKS } = require('../config/plans');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  for (const plan of PLANS) {
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
        process.env[plan.stripePriceEnv] || null,
      ]
    );
  }

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

  console.log('Migration et seed des forfaits termines.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Erreur de migration:', err);
  process.exit(1);
});
