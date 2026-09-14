const { getAccountContext } = require('../services/accountService');

async function requireBranding(req, res, next) {
  const account = await getAccountContext(req.session.userId);
  if (!account || !account.allow_custom_branding) {
    return res.status(403).render('error', {
      title: 'Fonctionnalite non disponible',
      message: "La personnalisation du logo et des couleurs necessite un forfait Base+ ou superieur.",
    });
  }
  req.account = account;
  next();
}

module.exports = requireBranding;
