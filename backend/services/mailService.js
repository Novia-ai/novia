const nodemailer = require('nodemailer');

// Envoi par SMTP (par defaut Gmail, avec un "mot de passe d'application"
// Google). Sans SMTP_USER / SMTP_PASS dans le .env, les courriels sont
// simplement ignores : les prospects restent visibles dans le dashboard.
let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function isConfigured() {
  return Boolean(getTransporter());
}

// Texte brut uniquement : le contenu vient des visiteurs, on ne l'insere
// jamais dans du HTML.
async function sendMail({ to, subject, text, replyTo }) {
  const t = getTransporter();
  if (!t) {
    console.log('SMTP non configure : courriel ignore.');
    return false;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM || `NovIA <${process.env.SMTP_USER}>`,
    to,
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
    text,
    replyTo: replyTo || undefined,
  });
  return true;
}

module.exports = { sendMail, isConfigured };
