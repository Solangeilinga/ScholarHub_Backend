const { PrismaClient } = require('@prisma/client');

// Création du client Prisma avec la bonne URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

// Test de connexion au démarrage
async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Connexion à Supabase établie avec succès');
    return true;
  } catch (error) {
    console.error('❌ Erreur de connexion à Supabase:', error.message);
    console.error('📝 URL utilisée:', process.env.DIRECT_URL || process.env.DATABASE_URL);
    return false;
  }
}

module.exports = { prisma, connectDatabase };
