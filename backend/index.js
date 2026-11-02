require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./db/pool');
const { PLANS } = require('./config/plans');
const i18n = require('./middleware/i18n');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const billingRoutes = require('./routes/billing');
const widgetConfigRoutes = require('./routes/widgetConfig');
const widgetPublicRoutes = require('./routes/widgetPublic');
const leadsRoutes = require('./routes/leads');
const conversationsRoutes = require('./routes/conversations');
const demoRoutes = require('./routes/demo');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3002;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
// Cloudflare et les navigateurs gardent style.css en cache 4h : on change
// son URL a chaque demarrage (donc a chaque deploiement) pour forcer le
// rechargement, sinon une nouvelle page s'affiche avec l'ancien CSS.
app.locals.assetVersion = Date.now().toString(36);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Le webhook Stripe a besoin du corps brut de la requete pour verifier la
// signature -> il est monte avant les parsers json/urlencoded globaux.
app.use('/webhooks', webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(i18n);

app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: 'auto',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/', authRoutes);
app.use('/', widgetPublicRoutes);
app.use('/demo', demoRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/billing', billingRoutes);
app.use('/dashboard/widget', widgetConfigRoutes);
app.use('/dashboard/leads', leadsRoutes);
app.use('/dashboard/conversations', conversationsRoutes);

// Moyenne mesuree en production le 2026-11-02 (29 reponses, ~600 tokens
// chacune) : sert a traduire les limites des forfaits en "reponses / mois"
// sur la page d'accueil, plus parlant qu'un nombre de tokens.
const AVG_TOKENS_PER_REPLY = 600;

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  const plans = PLANS.map((plan) => ({
    ...plan,
    approxReplies: Math.floor(plan.monthlyTokenLimit / AVG_TOKENS_PER_REPLY / 10) * 10,
  }));
  res.render('home', { titleKey: 'title.home', plans, accountDeleted: req.query.account_deleted === '1' });
});

app.get(['/conditions', '/terms'], (req, res) => {
  res.render('terms', { titleKey: 'title.terms' });
});

app.get(['/confidentialite', '/privacy'], (req, res) => {
  res.render('privacy', { titleKey: 'title.privacy' });
});

app.use((req, res) => {
  res.status(404).render('error', { titleKey: 'error.not_found_title', messageKey: 'error.not_found_message' });
});

app.listen(PORT, () => {
  console.log(`NovIA démarrée sur http://localhost:${PORT}`);
});
