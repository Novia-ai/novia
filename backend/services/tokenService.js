const pool = require('../db/pool');

async function checkQuota(userId) {
  const { rows } = await pool.query(
    `SELECT s.id AS subscription_id, s.tokens_used_current_period, s.monthly_token_limit,
            u.bonus_token_balance
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1 AND s.status = 'active'`,
    [userId]
  );
  const sub = rows[0];
  if (!sub) {
    return { allowed: false, remaining: 0, subscriptionId: null, reason: 'no_active_subscription' };
  }

  const remainingMonthly = sub.monthly_token_limit - sub.tokens_used_current_period;
  const remaining = (remainingMonthly > 0 ? remainingMonthly : 0) + sub.bonus_token_balance;

  return {
    allowed: remaining > 0,
    remaining,
    subscriptionId: sub.subscription_id,
    reason: remaining > 0 ? null : 'quota_exceeded',
  };
}

async function recordUsage(userId, subscriptionId, tokensUsed) {
  if (!subscriptionId || tokensUsed <= 0) return;

  const { rows } = await pool.query(
    `SELECT tokens_used_current_period, monthly_token_limit FROM subscriptions WHERE id = $1`,
    [subscriptionId]
  );
  const sub = rows[0];
  if (!sub) return;

  const remainingMonthly = Math.max(sub.monthly_token_limit - sub.tokens_used_current_period, 0);
  const fromMonthly = Math.min(remainingMonthly, tokensUsed);
  const fromBonus = tokensUsed - fromMonthly;

  await pool.query(
    `UPDATE subscriptions SET tokens_used_current_period = tokens_used_current_period + $1, updated_at = now() WHERE id = $2`,
    [fromMonthly, subscriptionId]
  );

  if (fromBonus > 0) {
    await pool.query(
      `UPDATE users SET bonus_token_balance = GREATEST(bonus_token_balance - $1, 0) WHERE id = $2`,
      [fromBonus, userId]
    );
  }
}

async function grantBonusTokens(userId, amount) {
  await pool.query(`UPDATE users SET bonus_token_balance = bonus_token_balance + $1 WHERE id = $2`, [
    amount,
    userId,
  ]);
}

async function resetCycle(subscriptionId, newPeriodStart, newPeriodEnd) {
  await pool.query(
    `UPDATE subscriptions
     SET tokens_used_current_period = 0, current_period_start = $1, current_period_end = $2, updated_at = now()
     WHERE id = $3`,
    [newPeriodStart, newPeriodEnd, subscriptionId]
  );
}

module.exports = { checkQuota, recordUsage, grantBonusTokens, resetCycle };
