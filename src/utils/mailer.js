const { Resend } = require('resend');
const logger = require('./logger');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    const { error } = await resend.emails.send({
      from: `ScholarHub <${process.env.EMAIL_FROM || 'onboarding@resend.dev'}>`,
      to,
      subject,
      html,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    logger.info(`✅ Email envoyé à ${to}`);
  } catch (error) {
    logger.error(`Erreur envoi email à ${to}: ${error.message}`);
    // Ne bloque pas l'app
  }
};

module.exports = { sendEmail };
