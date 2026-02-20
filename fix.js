const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.scholarship.updateMany({
  data: { deadline: new Date('2026-12-31') }
}).then(r => { console.log('Bourses mises a jour:', r.count); prisma.disconnect(); });
