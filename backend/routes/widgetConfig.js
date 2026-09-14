const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requireBranding = require('../middleware/requireBranding');
const { getAccountContext } = require('../services/accountService');
const { fetchPageText, ImportError } = require('../services/urlImportService');

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

const importLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

const MAX_KNOWLEDGE_LENGTH = 8000;

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
    titleKey: 'title.widget',
    account,
    widgetConfig,
    appBaseUrl: process.env.APP_BASE_URL,
  });
});

router.post('/branding', requireAuth, requireBranding, upload.single('logo'), async (req, res) => {
  const widgetConfig = await ensureWidgetConfig(req.session.userId);
  const { primaryColor } = req.body;

  const logoPath = req.file ? `/uploads/logos/${req.file.filename}` : widgetConfig.logo_path;

  await pool.query(
    `UPDATE widget_configs SET primary_color = $1, logo_path = $2, updated_at = now() WHERE user_id = $3`,
    [primaryColor || widgetConfig.primary_color, logoPath, req.session.userId]
  );

  res.redirect('/dashboard/widget');
});

router.post('/knowledge', requireAuth, async (req, res) => {
  const widgetConfig = await ensureWidgetConfig(req.session.userId);
  const { botName, greetingMessage, knowledgeBase } = req.body;

  await pool.query(
    `UPDATE widget_configs
     SET bot_name = $1, greeting_message = $2, knowledge_base = $3, updated_at = now()
     WHERE user_id = $4`,
    [
      (botName || widgetConfig.bot_name).slice(0, 40),
      (greetingMessage || widgetConfig.greeting_message).slice(0, 300),
      (knowledgeBase || '').slice(0, MAX_KNOWLEDGE_LENGTH),
      req.session.userId,
    ]
  );

  res.redirect('/dashboard/widget');
});

router.post('/import-url', requireAuth, importLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: res.locals.t('import.error.missing_url') });

  try {
    const text = await fetchPageText(url);
    res.json({ text });
  } catch (err) {
    if (err instanceof ImportError) {
      return res.status(err.status).json({ error: res.locals.t('import.error.' + err.code) });
    }
    console.error('Erreur import URL:', err);
    res.status(500).json({ error: res.locals.t('import.error.generic') });
  }
});

module.exports = router;
