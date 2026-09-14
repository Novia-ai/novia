const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requireBranding = require('../middleware/requireBranding');
const { getAccountContext } = require('../services/accountService');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'logos');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.session.userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

async function ensureWidgetConfig(userId) {
  const { rows } = await pool.query('SELECT * FROM widget_configs WHERE user_id = $1', [userId]);
  if (rows[0]) return rows[0];

  const clientKey = crypto.randomBytes(12).toString('hex');
  const { rows: created } = await pool.query(
    'INSERT INTO widget_configs (user_id, client_key) VALUES ($1, $2) RETURNING *',
    [userId, clientKey]
  );
  return created[0];
}

router.get('/', requireAuth, async (req, res) => {
  const account = await getAccountContext(req.session.userId);
  const widgetConfig = await ensureWidgetConfig(req.session.userId);
  res.render('dashboard-widget', {
    title: 'NovIA - Widget',
    account,
    widgetConfig,
    appBaseUrl: process.env.APP_BASE_URL,
  });
});

router.post('/', requireAuth, requireBranding, upload.single('logo'), async (req, res) => {
  const widgetConfig = await ensureWidgetConfig(req.session.userId);
  const { primaryColor, botName, greetingMessage } = req.body;

  const logoPath = req.file ? `/uploads/logos/${req.file.filename}` : widgetConfig.logo_path;

  await pool.query(
    `UPDATE widget_configs
     SET primary_color = $1, bot_name = $2, greeting_message = $3, logo_path = $4, updated_at = now()
     WHERE user_id = $5`,
    [
      primaryColor || widgetConfig.primary_color,
      botName || widgetConfig.bot_name,
      greetingMessage || widgetConfig.greeting_message,
      logoPath,
      req.session.userId,
    ]
  );

  res.redirect('/dashboard/widget');
});

module.exports = router;
