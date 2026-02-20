const cron = require('node-cron');
const prisma = require('../config/db');
const { sendEmail } = require('../utils/mailer');
const logger = require('../utils/logger');

const sendDeadlineReminders = async () => {
  logger.info('⏰ Vérification des deadlines...');
  
  const reminderDays = [1, 7, 30];
  
  for (const days of reminderDays) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const scholarships = await prisma.scholarship.findMany({
      where: {
        isActive: true,
        deadline: { gte: targetDate, lt: nextDay },
      },
    });

    for (const scholarship of scholarships) {
      // Get users who saved this scholarship
      const saved = await prisma.savedScholarship.findMany({
        where: { scholarshipId: scholarship.id },
        include: {
          user: { select: { email: true, name: true, notificationsEnabled: true } },
        },
      });

      for (const { user } of saved) {
        if (!user.notificationsEnabled) continue;

        await sendEmail({
          to: user.email,
          subject: `⏰ ScholarHub - Deadline dans ${days} jour(s): ${scholarship.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #6C63FF, #4ECDC4); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">ScholarHub</h1>
              </div>
              <div style="padding: 30px;">
                <h2>Bonjour ${user.name} 👋</h2>
                <p>La deadline de la bourse <strong>${scholarship.title}</strong> expire dans <strong>${days} jour(s)</strong>.</p>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3>${scholarship.title}</h3>
                  <p><strong>Fournisseur:</strong> ${scholarship.provider}</p>
                  <p><strong>Deadline:</strong> ${new Date(scholarship.deadline).toLocaleDateString('fr-FR')}</p>
                </div>
                <a href="${scholarship.link}" style="background: #6C63FF; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Postuler maintenant
                </a>
              </div>
            </div>
          `,
        });

        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: (await prisma.savedScholarship.findFirst({
              where: { scholarshipId: scholarship.id },
              include: { user: true },
            })).userId,
            title: `Deadline dans ${days} jour(s)`,
            body: `La bourse "${scholarship.title}" expire bientôt !`,
            type: 'DEADLINE_REMINDER',
            data: { scholarshipId: scholarship.id },
          },
        });
      }
    }
  }
  
  logger.info('✅ Rappels de deadline envoyés');
};

const notifyNewScholarships = async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const newScholarships = await prisma.scholarship.findMany({
    where: { createdAt: { gte: yesterday }, isActive: true },
  });

  if (newScholarships.length === 0) return;

  const users = await prisma.user.findMany({
    where: { notificationsEnabled: true },
    select: { id: true, email: true, name: true, country: true, level: true, fields: true },
  });

  for (const user of users) {
    const relevant = newScholarships.filter((s) => {
      return (
        (!user.country || s.countries.includes(user.country) || s.countries.length === 0) &&
        (!user.level || s.level.includes(user.level))
      );
    });

    if (relevant.length > 0) {
      await sendEmail({
        to: user.email,
        subject: `🎓 ScholarHub - ${relevant.length} nouvelle(s) bourse(s) pour vous !`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2>Bonjour ${user.name} !</h2>
            <p>${relevant.length} nouvelle(s) bourse(s) correspondent à votre profil :</p>
            ${relevant.map(s => `
              <div style="border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 8px;">
                <h3>${s.title}</h3>
                <p>${s.provider} | Deadline: ${new Date(s.deadline).toLocaleDateString('fr-FR')}</p>
              </div>
            `).join('')}
            <p>Consultez l'application ScholarHub pour plus de détails.</p>
          </div>
        `,
      });
    }
  }
};

const startCronJobs = () => {
  // Check deadlines every day at 8am
  cron.schedule('0 8 * * *', sendDeadlineReminders, {
    timezone: 'Africa/Abidjan',
  });

  // Notify new scholarships every day at 9am
  cron.schedule('0 9 * * *', notifyNewScholarships, {
    timezone: 'Africa/Abidjan',
  });

  logger.info('🔄 Cron jobs démarrés');
};

module.exports = { startCronJobs };
