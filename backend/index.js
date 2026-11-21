require('dotenv').config();

const crypto = require('crypto');
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
const hubaraRoutes = require('./routes/hubara');
const webhookRoutes = require('./routes/webhooks');
const { router: adminRoutes } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3002;

function memeTexte(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Mot de passe partage de la version web de test d'« Une vie bien rangee »
// (JEU_TEST_UTILISATEUR / JEU_TEST_MOT_DE_PASSE dans le .env). Sans mot de
// passe configure, la page reste fermee.
function jeuProtege(req, res, next) {
  // private : Cloudflare ne doit jamais garder en cache une copie du jeu
  // qu'il servirait ensuite sans mot de passe.
  res.set({ 'Cache-Control': 'private, no-cache', 'X-Robots-Tag': 'noindex, nofollow' });
  const utilisateur = process.env.JEU_TEST_UTILISATEUR;
  const motDePasse = process.env.JEU_TEST_MOT_DE_PASSE;
  if (!utilisateur || !motDePasse) return res.status(404).send('Page introuvable');
  const [type, valeur] = (req.get('authorization') || '').split(' ');
  if (type === 'Basic' && valeur) {
    const texte = Buffer.from(valeur, 'base64').toString();
    const i = texte.indexOf(':');
    if (i > 0 && memeTexte(texte.slice(0, i), utilisateur) && memeTexte(texte.slice(i + 1), motDePasse)) {
      // Les fichiers du jeu sont relatifs : il faut la barre finale.
      if (req.originalUrl === '/uneviebienrangee') return res.redirect(301, '/uneviebienrangee/');
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Une vie bien rangee (test)", charset="UTF-8"');
  res.status(401).send('Mot de passe requis');
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
// Cloudflare et les navigateurs gardent style.css en cache 4h : on change
// son URL a chaque demarrage (donc a chaque deploiement) pour forcer le
// rechargement, sinon une nouvelle page s'affiche avec l'ancien CSS.
app.locals.assetVersion = Date.now().toString(36);

app.disable('x-powered-by');

// En-tetes de securite de base. Seul /widget/frame doit pouvoir s'afficher
// dans une iframe sur les sites des clients ; le reste (dashboard, connexion)
// est interdit d'integration pour bloquer le clickjacking.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (!req.path.startsWith('/widget/')) {
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Content-Security-Policy', "frame-ancestors 'self'");
  }
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Les logos televerses peuvent etre des SVG, qui peuvent contenir du
// script : on les sert dans un bac a sable pour qu'ouvrir l'URL directement
// n'execute rien sur novia.help.
app.use('/uploads', (req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  next();
});

// Les fichiers de l'export Godot sont deposes sur le CT dans jeux-prives/,
// hors du depot (trop lourds pour git).
app.use('/uneviebienrangee', jeuProtege, express.static(path.join(__dirname, '..', 'jeux-prives', 'uneviebienrangee')));

// extensions : les pages statiques (ex. /jeux/...) s'ouvrent sans ".html".
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

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

// Affiche le lien "Admin" de la barre laterale aux seuls administrateurs.
app.locals.isAdmin = false;
app.use('/dashboard', async (req, res, next) => {
  if (!req.session.userId) return next();
  try {
    const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
    res.locals.isAdmin = Boolean(rows[0] && rows[0].is_admin);
  } catch (err) {
    console.error(err);
  }
  next();
});

app.use('/', authRoutes);
app.use('/', widgetPublicRoutes);
app.use('/demo', demoRoutes);
app.use('/api/hubara', hubaraRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/billing', billingRoutes);
app.use('/dashboard/widget', widgetConfigRoutes);
app.use('/dashboard/leads', leadsRoutes);
app.use('/dashboard/conversations', conversationsRoutes);
app.use('/dashboard/admin', adminRoutes);

// Moyenne mesuree en production le 2026-11-02 (29 reponses, ~600 tokens
// chacune) : sert a traduire les limites des forfaits en "reponses / mois"
// sur la page d'accueil, plus parlant qu'un nombre de tokens.
const AVG_TOKENS_PER_REPLY = 600;

app.get('/', async (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  let showcaseSites = [];
  try {
    ({ rows: showcaseSites } = await pool.query('SELECT name, url FROM showcase_sites ORDER BY created_at'));
  } catch (err) {
    console.error(err);
  }
  const plans = PLANS.map((plan) => ({
    ...plan,
    approxReplies: Math.floor(plan.monthlyTokenLimit / AVG_TOKENS_PER_REPLY / 10) * 10,
  }));
  res.render('home', {
    titleKey: 'title.home',
    plans,
    showcaseSites,
    accountDeleted: req.query.account_deleted === '1',
  });
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
