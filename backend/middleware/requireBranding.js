const { getAccountContext } = require('../services/accountService');

async function requireBranding(req, res, next) {
  const account = await getAccountContext(req.session.userId);
  if (!account || !account.allow_custom_branding) {
    return res.status(403).render('error', {
      titleKey: 'error.branding_locked_title',
      messageKey: 'error.branding_locked_message',
    });
  }
  req.account = account;
  next();
}

module.exports = requireBranding;
