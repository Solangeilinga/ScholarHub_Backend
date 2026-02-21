const admin = require('firebase-admin');

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
    console.error('Push notification error:', error.message);
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
      await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'scholarhub' },
        },
      });
    } catch (error) {
      console.error('Multicast error:', error.message);
    }
  }
};

module.exports = { sendPushNotification, sendPushToMany };