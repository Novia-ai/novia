const pool = require('../db/pool');

async function getAccountContext(userId) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.bonus_token_balance,
            s.id AS subscription_id, s.status, s.autopay, s.current_period_end,
            s.tokens_used_current_period, s.monthly_token_limit,
            p.key AS plan_key, p.name AS plan_name, p.allow_custom_branding, p.price_cents
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { getAccountContext };
