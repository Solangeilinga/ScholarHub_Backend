const express = require('express')
const router = express.Router()
const prisma = require('../../config/db')
const { runScraping, getScrapingStats } = require('./scraper.service')
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware')

// Lancer le scraping manuellement
router.post('/run', authenticate, requireAdmin, async (req, res) => {
  try {
    // Lancer en arrière-plan pour ne pas bloquer la requête
    res.json({ message: 'Scraping lancé en arrière-plan' })
    await runScraping()
  } catch (e) {
    console.error(e)
  }
})

// Stats scraping
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  const stats = await getScrapingStats()
  res.json({ stats })
})

// Bourses en attente de validation
router.get('/pending', authenticate, requireAdmin, async (req, res) => {
  const scholarships = await prisma.scholarship.findMany({
    where: { status: 'PENDING' },
    orderBy: { scrapedAt: 'desc' },
  })
  res.json({ scholarships })
})

// Approuver une bourse
router.patch('/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const scholarship = await prisma.scholarship.update({
    where: { id: req.params.id },
    data: {
      status: 'APPROVED',
      isActive: true,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  })
  res.json({ scholarship })
})

// Rejeter une bourse
router.patch('/:id/reject', authenticate, requireAdmin, async (req, res) => {
  const scholarship = await prisma.scholarship.update({
    where: { id: req.params.id },
    data: {
      status: 'REJECTED',
      isActive: false,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  })
  res.json({ scholarship })
})

// Approuver en masse
router.post('/approve-all', authenticate, requireAdmin, async (req, res) => {
  const { ids } = req.body
  await prisma.scholarship.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      isActive: true,
      verifiedBy: req.user.id,
      verifiedAt: new Date(),
    },
  })
  res.json({ message: `${ids.length} bourses approuvées` })
})

module.exports = router