const translations = require('../i18n/translations');

const SUPPORTED = ['fr', 'en'];
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

function i18n(req, res, next) {
  let lang = req.cookies && req.cookies.novia_lang;

  if (SUPPORTED.includes(req.query.lang)) {
    lang = req.query.lang;
    res.cookie('novia_lang', lang, { maxAge: COOKIE_MAX_AGE, httpOnly: false, sameSite: 'lax' });
  }

  if (!SUPPORTED.includes(lang)) lang = 'fr';

  res.locals.lang = lang;
  res.locals.t = function t(key) {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry.fr || key;
  };

  next();
}

module.exports = i18n;
