const nodemailer = require('nodemailer');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,           // ← était 587
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: `"ScholarHub" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Erreur envoi email à ${to}:`, error);
    // Don't throw - email failures shouldn't break the app
  }
};

module.exports = { sendEmail };
