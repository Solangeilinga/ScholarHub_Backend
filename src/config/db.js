const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

prisma.$connect()
  .then(() => logger.info('✅ Base de données connectée'))
  .catch((err) => {
    logger.error('❌ Erreur connexion base de données:', err);
    process.exit(1);
  });

module.exports = prisma;
