const prisma = require('../config/db');
const { sendPushNotification, sendPushToMany } = require('./firebase');

const createAndSendNotification = async (userId, title, body, type, data = {}) => {
  // Sauvegarder en base
  await prisma.notification.create({
    data: { userId, title, body, type, data },
  });

  // Envoyer push si token disponible
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true, notificationsEnabled: true },
  });

  if (user?.fcmToken && user?.notificationsEnabled) {
    await sendPushNotification(user.fcmToken, title, body, data);
  }
};

const notifyAllUsers = async (title, body, type, data = {}) => {
  const users = await prisma.user.findMany({
    where: { notificationsEnabled: true, fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });

  // Créer notifications en base
  await prisma.notification.createMany({
    data: users.map(u => ({ userId: u.id, title, body, type, data })),
  });

  // Envoyer push
  const tokens = users.map(u => u.fcmToken).filter(Boolean);
  await sendPushToMany(tokens, title, body, data);
};

module.exports = { createAndSendNotification, notifyAllUsers };