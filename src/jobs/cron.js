const cron = require('node-cron');
const prisma = require('../config/db');
const { sendEmail } = require('../utils/mailer');
const { createAndSendNotification } = require('../utils/notifications');
const { runScraping } = require('../modules/scraper/scraper.service');
const logger = require('../utils/logger');

// ─── Rappels deadline ─────────────────────────────────────────────────────────
const sendDeadlineReminders = async () => {
  logger.info('⏰ Vérification des deadlines...');

  const reminderDays = [1, 7, 30];

  for (const days of reminderDays) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const scholarships = await prisma.scholarship.findMany({
      where: { isActive: true, deadline: { gte: targetDate, lt: nextDay } },
    });

    for (const scholarship of scholarships) {
      const saved = await prisma.savedScholarship.findMany({
        where: { scholarshipId: scholarship.id },
        include: {
          user: {
            select: { id: true, email: true, name: true, notificationsEnabled: true, fcmToken: true },
          },
        },
      });

      for (const { user } of saved) {
        if (!user.notificationsEnabled) continue;

        await sendEmail({
          to: user.email,
          subject: `⏰ ScholarHub - Deadline dans ${days} jour(s): ${scholarship.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1A1F8F; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0;">ScholarHub</h1>
              </div>
              <div style="padding: 30px; background: white; border: 1px solid #eee;">
                <h2>Bonjour ${user.name} 👋</h2>
                <p>La deadline de la bourse <strong>${scholarship.title}</strong> expire dans <strong>${days} jour(s)</strong>.</p>
                <div style="background: #F5F6FF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1A1F8F;">
                  <h3 style="margin: 0 0 8px;">${scholarship.title}</h3>
                  <p style="margin: 4px 0;"><strong>Fournisseur:</strong> ${scholarship.provider}</p>
                  <p style="margin: 4px 0;"><strong>Deadline:</strong> ${new Date(scholarship.deadline).toLocaleDateString('fr-FR')}</p>
                </div>
                <a href="${scholarship.link}" style="background: #1A1F8F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">
                  Postuler maintenant
                </a>
              </div>
            </div>
          `,
        });

        await createAndSendNotification(
          user.id,
          `⏰ Deadline dans ${days} jour(s)`,
          `La bourse "${scholarship.title}" expire bientôt !`,
          'DEADLINE_REMINDER',
          { scholarshipId: scholarship.id }
        );
      }
    }
  }

  logger.info('✅ Rappels de deadline envoyés');
};

// ─── Nouvelles bourses ────────────────────────────────────────────────────────
const notifyNewScholarships = async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const newScholarships = await prisma.scholarship.findMany({
    where: { createdAt: { gte: yesterday }, isActive: true },
  });

  if (newScholarships.length === 0) return;

  const users = await prisma.user.findMany({
    where: { notificationsEnabled: true },
    select: { id: true, email: true, name: true, country: true, level: true, fields: true, fcmToken: true },
  });

  for (const user of users) {
    const relevant = newScholarships.filter((s) =>
      (!user.country || s.countries.includes(user.country) || s.countries.length === 0) &&
      (!user.level || s.level.includes(user.level))
    );

    if (relevant.length === 0) continue;

    await sendEmail({
      to: user.email,
      subject: `🎓 ScholarHub - ${relevant.length} nouvelle(s) bourse(s) pour vous !`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1A1F8F; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0;">ScholarHub</h1>
          </div>
          <div style="padding: 30px; background: white; border: 1px solid #eee;">
            <h2>Bonjour ${user.name} !</h2>
            <p>${relevant.length} nouvelle(s) bourse(s) correspondent à votre profil :</p>
            ${relevant.map(s => `
              <div style="border: 1px solid #E8EAF6; padding: 15px; margin: 10px 0; border-radius: 8px;">
                <h3 style="margin: 0 0 8px;">${s.title}</h3>
                <p style="margin: 0; color: #6B7280;">${s.provider} | Deadline: ${new Date(s.deadline).toLocaleDateString('fr-FR')}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `,
    });

    await createAndSendNotification(
      user.id,
      `🎓 ${relevant.length} nouvelle(s) bourse(s) pour vous !`,
      `${relevant[0].title}${relevant.length > 1 ? ` et ${relevant.length - 1} autre(s)` : ''}`,
      'NEW_SCHOLARSHIP',
      { count: relevant.length }
    );
  }
};

// ─── Notification du soir 20h ─────────────────────────────────────────────────
const sendEveningReminder = async () => {
  logger.info('🌙 Envoi des notifications du soir...');

  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const usersWithSaved = await prisma.user.findMany({
    where: {
      notificationsEnabled: true,
      fcmToken: { not: null },
      savedScholarships: {
        some: {
          scholarship: {
            isActive: true,
            deadline: { gte: new Date(), lte: in30Days },
          },
        },
      },
    },
    select: {
      id: true,
      savedScholarships: {
        where: {
          scholarship: {
            isActive: true,
            deadline: { gte: new Date(), lte: in30Days },
          },
        },
        include: {
          scholarship: { select: { title: true, deadline: true } },
        },
      },
    },
  });

  const notifiedIds = [];

  for (const user of usersWithSaved) {
    const count = user.savedScholarships.length;
    const nearest = user.savedScholarships.sort(
      (a, b) => new Date(a.scholarship.deadline) - new Date(b.scholarship.deadline)
    )[0];
    const daysLeft = Math.ceil(
      (new Date(nearest.scholarship.deadline) - new Date()) / (1000 * 60 * 60 * 24)
    );

    await createAndSendNotification(
      user.id,
      '📚 Rappel ScholarHub',
      count === 1
        ? `La bourse "${nearest.scholarship.title}" expire dans ${daysLeft} jours !`
        : `Vous avez ${count} bourses sauvegardées. La plus proche expire dans ${daysLeft} jours !`,
      'EVENING_REMINDER',
      {}
    );

    notifiedIds.push(user.id);
  }

  const usersWithoutSaved = await prisma.user.findMany({
    where: {
      notificationsEnabled: true,
      fcmToken: { not: null },
      id: { notIn: notifiedIds },
    },
    select: { id: true },
  });

  for (const user of usersWithoutSaved) {
    await createAndSendNotification(
      user.id,
      '🎓 Bonsoir !',
      'De nouvelles bourses vous attendent. Prenez 5 minutes pour explorer ScholarHub !',
      'EVENING_REMINDER',
      {}
    );
  }

  logger.info(`🌙 Notifications du soir envoyées à ${notifiedIds.length + usersWithoutSaved.length} utilisateurs`);
};

// ─── 🆕 Scraping automatique ──────────────────────────────────────────────────
const runDailyScraping = async () => {
  logger.info('🔍 Scraping automatique quotidien...');
  try {
    const results = await runScraping();
    logger.info(`✅ Scraping terminé — ${results.inserted} nouvelles bourses en attente de validation`);
  } catch (e) {
    logger.error(`❌ Erreur scraping: ${e.message}`);
  }
};

// ─── Démarrage ────────────────────────────────────────────────────────────────
const startCronJobs = () => {
  cron.schedule('0 8 * * *', sendDeadlineReminders, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 9 * * *', notifyNewScholarships, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 20 * * *', sendEveningReminder, { timezone: 'Africa/Abidjan' });
  cron.schedule('0 3 * * *', runDailyScraping, { timezone: 'Africa/Abidjan' }); // 🆕 3h du matin
  logger.info('🔄 Cron jobs démarrés (3h scraping, 8h deadlines, 9h nouvelles bourses, 20h soir)');
};

module.exports = { startCronJobs };