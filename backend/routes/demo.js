const express = require('express');
const rateLimit = require('express-rate-limit');
const demoSessionService = require('../services/demoSessionService');
const openaiService = require('../services/openaiService');
const { fetchPageText, ImportError } = require('../services/urlImportService');

const router = express.Router();

const analyzeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const messageLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40 });

router.get('/', (req, res) => {
  res.render('demo', { titleKey: 'demo.title', session: null, demoId: null, error: null });
});

router.post('/analyze', analyzeLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.render('demo', { titleKey: 'demo.title', session: null, demoId: null, error: 'import.error.missing_url' });
  }

  try {
    const text = await fetchPageText(url);
    const demoId = demoSessionService.createSession(url, text);
    res.redirect('/demo/' + demoId);
  } catch (err) {
    const errorKey = err instanceof ImportError ? 'import.error.' + err.code : 'import.error.generic';
    if (!(err instanceof ImportError)) console.error('Erreur analyse demo:', err);
    res.render('demo', { titleKey: 'demo.title', session: null, demoId: null, error: errorKey });
  }
});

router.get('/:demoId', (req, res) => {
  const session = demoSessionService.getSession(req.params.demoId);
  if (!session) {
    return res.render('demo', { titleKey: 'demo.title', session: null, demoId: null, error: 'demo.expired' });
  }
  res.render('demo', { titleKey: 'demo.title', session, demoId: req.params.demoId, error: null });
});

router.post('/:demoId/message', messageLimiter, async (req, res) => {
  const session = demoSessionService.getSession(req.params.demoId);
  if (!session) {
    return res.status(410).json({ error: res.locals.t('demo.expired') });
  }
  if (!demoSessionService.canSendMessage(req.params.demoId)) {
    return res.status(429).json({ error: res.locals.t('demo.limit_reached'), capped: true });
  }

  const userMessage = (req.body.message || '').toString().slice(0, 2000);
  if (!userMessage.trim()) return res.status(400).json({ error: res.locals.t('import.error.missing_url') });

  const systemPrompt =
    "Tu es NovIA, un assistant virtuel qui fait une démonstration en direct à partir du contenu du site web ci-dessous. " +
    "Réponds uniquement à partir de ces informations. Si la réponse ne s'y trouve pas, dis-le poliment plutôt que d'inventer. " +
    "Si une page listée ci-dessous correspond à la demande du visiteur, recommande-la clairement en incluant son URL complète :\n\n" +
    session.knowledgeBase;

  try {
    const { reply } = await openaiService.getChatReply({
      systemPrompt,
      history: session.history,
      userMessage,
    });

    demoSessionService.recordExchange(req.params.demoId, userMessage, reply);
    res.json({ reply, remaining: demoSessionService.MAX_MESSAGES_PER_SESSION - session.messageCount - 1 });
  } catch (err) {
    console.error('Erreur OpenAI (demo):', err);
    res.status(500).json({ error: res.locals.t('import.error.generic') });
  }
});

module.exports = router;
