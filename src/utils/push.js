const { getAdmin } = require('../config/firebase-admin')
const prisma = require('../config/db')
const logger = require('../utils/logger')

/**
 * Envoie une notification push à un seul utilisateur via son fcmToken
 */
const sendPushToUser = async ({ userId, title, body, data = {} }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true, notificationsEnabled: true },
  })

  if (!user?.fcmToken || !user.notificationsEnabled) return

  try {
    await getAdmin().messaging().send({
      token: user.fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          channelId: 'scholarhub_main',
          icon: 'ic_notification',
          color: '#1B2FBE',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    })
  } catch (e) {
    // Token expiré ou invalide → on le supprime
    if (
      e.code === 'messaging/registration-token-not-registered' ||
      e.code === 'messaging/invalid-registration-token'
    ) {
      await prisma.user.update({
        where: { id: userId },
        data: { fcmToken: null },
      })
      logger.warn(`🗑️ FCM token supprimé pour user ${userId}`)
    } else {
      logger.error(`Push error pour user ${userId}:`, e.message)
    }
  }
}

/**
 * Envoie une notification push à plusieurs utilisateurs
 * Gère automatiquement les tokens expirés
 */
const sendPushToMany = async ({ userIds, title, body, data = {} }) => {
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      fcmToken: { not: null },
      notificationsEnabled: true,
    },
    select: { id: true, fcmToken: true },
  })

  if (users.length === 0) return

  const messages = users.map((u) => ({
    token: u.fcmToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: {
        channelId: 'scholarhub_main',
        icon: 'ic_notification',
        color: '#1B2FBE',
        sound: 'default',
      },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  }))

  const response = await getAdmin().messaging().sendEach(messages)

  // Nettoyer les tokens invalides
  const expiredIds = []
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      (r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-registration-token')
    ) {
      expiredIds.push(users[i].id)
    }
  })

  if (expiredIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: expiredIds } },
      data: { fcmToken: null },
    })
    logger.warn(`🗑️ ${expiredIds.length} tokens FCM expirés supprimés`)
  }

  logger.info(`📱 Push envoyé: ${response.successCount}/${users.length} succès`)
}

module.exports = { sendPushToUser, sendPushToMany }