const admin = require('firebase-admin');
const prisma = require('../config/db');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'scholarhub' },
      },
    });
  } catch (error) {
    // Token expiré ou invalide → supprimer de la DB
    if (
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token'
    ) {
      await prisma.user.updateMany({
        where: { fcmToken },
        data: { fcmToken: null },
      });
    }
    console.error('Push error:', error.message);
  }
};

const sendPushToMany = async (fcmTokens, title, body, data = {}) => {
  const validTokens = fcmTokens.filter(Boolean);
  if (validTokens.length === 0) return;

  const chunks = [];
  for (let i = 0; i < validTokens.length; i += 500) {
    chunks.push(validTokens.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'scholarhub' },
        },
      });

      // Nettoyer les tokens expirés
      const expiredTokens = [];
      response.responses.forEach((r, i) => {
        if (
          !r.success &&
          (r.error?.code === 'messaging/registration-token-not-registered' ||
            r.error?.code === 'messaging/invalid-registration-token')
        ) {
          expiredTokens.push(chunk[i]);
        }
      });

      if (expiredTokens.length > 0) {
        await prisma.user.updateMany({
          where: { fcmToken: { in: expiredTokens } },
          data: { fcmToken: null },
        });
      }
    } catch (error) {
      console.error('Multicast error:', error.message);
    }
  }
};

module.exports = { sendPushNotification, sendPushToMany };