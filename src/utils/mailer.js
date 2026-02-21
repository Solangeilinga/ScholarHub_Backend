const sgMail = require('@sendgrid/mail');
const logger = require('./logger');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    await sgMail.send({
      to,
      from: {
        email: process.env.SENDGRID_FROM,
        name: 'ScholarHub',
      },
      subject,
      html,
    });
    logger.info(`✅ Email envoyé à ${to}`);
  } catch (error) {
    logger.error(`Erreur envoi email à ${to}: ${error.message}`);
    // Ne bloque pas l'app
  }
};

module.exports = { sendEmail };