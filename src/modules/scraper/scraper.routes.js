const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const prisma = require('../../config/db');
const { runScraping, getScrapingStats } = require('./scraper.service');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');
const logger = require('../../utils/logger');

const scraperRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Une exécution du scraper a déjà été demandée récemment. Réessayez dans 15 minutes.' },
});

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
};

const scholarshipIdValidation = [
  param('id').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Identifiant de bourse invalide'),
];

// Lancer le scraping manuellement : la tâche s'exécute en arrière-plan.
router.post('/run', authenticate, requireAdmin, scraperRunLimiter, (req, res) => {
  res.status(202).json({ message: 'Scraping lancé en arrière-plan' });
  runScraping().catch((error) => {
    logger.error('Échec du scraping manuel', { message: error.message, stack: error.stack });
  });
});

router.get('/stats', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const stats = await getScrapingStats();
  res.json({ stats });
}));

router.get('/pending', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const scholarships = await prisma.scholarship.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ confidenceScore: 'asc' }, { scrapedAt: 'desc' }],
    take: 100,
  });
  res.json({ scholarships });
}));

router.patch('/:id/approve', authenticate, requireAdmin, scholarshipIdValidation, validateRequest, asyncHandler(async (req, res) => {
  const scholarship = await prisma.scholarship.update({
    where: { id: req.params.id },
    data: {
      status: 'APPROVED',
      isActive: true,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  });
  res.json({ scholarship });
}));

router.patch('/:id/reject', authenticate, requireAdmin, scholarshipIdValidation, validateRequest, asyncHandler(async (req, res) => {
  const scholarship = await prisma.scholarship.update({
    where: { id: req.params.id },
    data: {
      status: 'REJECTED',
      isActive: false,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  });
  res.json({ scholarship });
}));

router.post('/approve-all', authenticate, requireAdmin, [
  body('ids').isArray({ min: 1, max: 100 }).withMessage('Sélection de bourses invalide'),
  body('ids.*').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Identifiant de bourse invalide'),
], validateRequest, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const result = await prisma.scholarship.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      isActive: true,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  });
  res.json({ message: `${result.count} bourses approuvées`, updatedCount: result.count });
}));

module.exports = router;
