const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const { getAccountContext } = require('../services/accountService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const { rows: leads } = await pool.query(
    'SELECT * FROM leads WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
    [req.session.userId]
  );
  res.render('dashboard-leads', { titleKey: 'title.leads', account, leads });
});

module.exports = router;
