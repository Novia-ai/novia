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

// Permet au client de repondre a une demande d'effacement d'un visiteur.
router.post('/:id/delete', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM leads WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
  res.redirect('/dashboard/leads');
});

module.exports = router;
