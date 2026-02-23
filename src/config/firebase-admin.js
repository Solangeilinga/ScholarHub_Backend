const admin = require('firebase-admin')
const logger = require('../utils/logger')

let initialized = false

const initFirebaseAdmin = () => {
  if (initialized) return admin
  
  try {
    // Mettre les credentials dans .env sous forme de JSON stringifié
    // ou pointer vers le fichier serviceAccountKey.json
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    
    initialized = true
    logger.info('✅ Firebase Admin initialisé')
  } catch (e) {
    logger.error('❌ Firebase Admin init error:', e.message)
  }
  
  return admin
}

module.exports = { initFirebaseAdmin, getAdmin: () => admin }