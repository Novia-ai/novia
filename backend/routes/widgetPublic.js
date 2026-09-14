const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pool = require('../db/pool');
const openaiService = require('../services/openaiService');
const tokenService = require('../services/tokenService');

const router = express.Router();

const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
const leadLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

const CONTACT_MARKER = '[[CONTACT]]';

router.get('/widget/frame/:clientKey', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT wc.*, p.allow_custom_branding
     FROM widget_configs wc
     JOIN users u ON u.id = wc.user_id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE wc.client_key = $1`,
    [req.params.clientKey]
  );
  const config = rows[0];
  if (!config) return res.status(404).send('Widget introuvable');

  const branded = Boolean(config.allow_custom_branding);
  res.render('widget-frame', {
    clientKey: req.params.clientKey,
    botName: config.bot_name,
    greeting: config.greeting_message,
    primaryColor: branded ? config.primary_color : '#3b4256',
    logoUrl: branded && config.logo_path ? config.logo_path : '/images/capybara-logo.png',
    novaHomeUrl: process.env.APP_BASE_URL || 'https://novia.help',
  });
});

router.get('/widget/logo/:clientKey', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT wc.logo_path, p.allow_custom_branding
     FROM widget_configs wc
     JOIN users u ON u.id = wc.user_id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE wc.client_key = $1`,
    [req.params.clientKey]
  );
  const config = rows[0];
  const branded = Boolean(config && config.allow_custom_branding);
  const logoUrl = branded && config.logo_path ? config.logo_path : '/images/capybara-logo.png';
  res.redirect(logoUrl);
});

router.post('/api/widget/:clientKey/message', chatLimiter, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT user_id, bot_name, knowledge_base FROM widget_configs WHERE client_key = $1',
    [req.params.clientKey]
  );
  const config = rows[0];
  if (!config) return res.status(404).json({ error: 'widget_introuvable' });

  const quota = await tokenService.checkQuota(config.user_id);
  if (!quota.allowed) {
    return res.status(402).json({
      error: 'quota_depasse',
      message: "Ce site a atteint sa limite de messages pour l'instant. Merci de réessayer plus tard.",
    });
  }

  const userMessage = (req.body.message || '').toString().slice(0, 2000);
  if (!userMessage.trim()) return res.status(400).json({ error: 'message_vide' });

  const visitorId =
    typeof req.body.visitorId === 'string' && req.body.visitorId.length <= 64
      ? req.body.visitorId
      : crypto.randomBytes(8).toString('hex');

  const { rows: convRows } = await pool.query(
    `SELECT id FROM conversations WHERE user_id = $1 AND visitor_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [config.user_id, visitorId]
  );
  let conversationId = convRows[0] && convRows[0].id;
  if (!conversationId) {
    const { rows: created } = await pool.query(
      'INSERT INTO conversations (user_id, visitor_id) VALUES ($1, $2) RETURNING id',
      [config.user_id, visitorId]
    );
    conversationId = created[0].id;
  }

  const { rows: historyRows } = await pool.query(
    `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20`,
    [conversationId]
  );

  let systemPrompt = `Tu es ${config.bot_name}, un assistant virtuel utile et concis pour le site web de ce client.`;
  if (config.knowledge_base && config.knowledge_base.trim()) {
    systemPrompt +=
      "\n\nInformations sur l'entreprise à utiliser en priorité pour répondre. " +
      "Si la question porte sur l'entreprise et que la réponse ne s'y trouve pas, dis que tu ne sais pas plutôt que d'inventer. " +
      "Si une page listée ci-dessous correspond à la demande du visiteur, recommande-la clairement en incluant son URL complète :\n" +
      config.knowledge_base;
  }
  systemPrompt +=
    `\n\nSi le visiteur demande un prix précis, un devis, un rendez-vous, ou toute demande qui mérite un suivi humain direct, ` +
    `termine ta réponse par le jeton ${CONTACT_MARKER} seul sur sa propre ligne, sans rien ajouter apres. ` +
    `Ne l'utilise pas pour des questions simples auxquelles tu peux deja repondre completement.`;

  try {
    const { reply: rawReply, tokensUsed } = await openaiService.getChatReply({
      systemPrompt,
      history: historyRows,
      userMessage,
    });

    const suggestContact = rawReply.includes(CONTACT_MARKER);
    const reply = rawReply.split(CONTACT_MARKER).join('').trim();

    await pool.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [
      conversationId,
      userMessage,
    ]);
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content, tokens_used) VALUES ($1, 'assistant', $2, $3)",
      [conversationId, reply, tokensUsed]
    );

    await tokenService.recordUsage(config.user_id, quota.subscriptionId, tokensUsed);

    res.json({ reply, visitorId, conversationId, suggestContact });
  } catch (err) {
    console.error('Erreur OpenAI:', err);
    res.status(500).json({ error: 'erreur_ia', message: 'Désolé, une erreur est survenue.' });
  }
});

router.post('/api/widget/:clientKey/lead', leadLimiter, async (req, res) => {
  const { rows } = await pool.query('SELECT user_id FROM widget_configs WHERE client_key = $1', [
    req.params.clientKey,
  ]);
  const config = rows[0];
  if (!config) return res.status(404).json({ error: 'widget_introuvable' });

  const name = (req.body.name || '').toString().trim().slice(0, 200);
  const email = (req.body.email || '').toString().trim().slice(0, 200);
  const phone = (req.body.phone || '').toString().trim().slice(0, 50);
  const message = (req.body.message || '').toString().trim().slice(0, 2000);
  const conversationId = Number.isInteger(req.body.conversationId) ? req.body.conversationId : null;

  if (!name || (!email && !phone)) {
    return res.status(400).json({ error: 'champs_requis' });
  }

  await pool.query(
    `INSERT INTO leads (user_id, conversation_id, name, email, phone, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [config.user_id, conversationId, name, email || null, phone || null, message || null]
  );

  res.json({ ok: true });
});

module.exports = router;
