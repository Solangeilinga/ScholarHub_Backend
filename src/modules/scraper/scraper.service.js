const prisma = require('../../config/db')
const logger = require('../../utils/logger')
const OpportunitesAfriqueScraper = require('./scrapers/opportunites-afrique')
const CampusFranceScraper = require('./scrapers/campus-france')
const DAADScraper = require('./scrapers/daad')

const SCRAPERS = [
  new OpportunitesAfriqueScraper(),
  new CampusFranceScraper(),
  new DAADScraper(),
]

const runScraping = async () => {
  logger.info('🔍 Démarrage du scraping automatique...')
  const results = { total: 0, inserted: 0, duplicates: 0, errors: 0 }

  for (const scraper of SCRAPERS) {
    try {
      const scholarships = await scraper.scrape()
      results.total += scholarships.length

      for (const s of scholarships) {
        try {
          // Vérifier doublon par titre + provider
          const existing = await prisma.scholarship.findFirst({
            where: {
              title: { equals: s.title, mode: 'insensitive' },
              provider: { equals: s.provider, mode: 'insensitive' },
            },
          })

          if (existing) {
            results.duplicates++
            continue
          }

          // Ignorer si pas de deadline valide
          if (!s.deadline) {
            // Mettre une deadline par défaut à 3 mois
            s.deadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          }

          await prisma.scholarship.create({
            data: {
              title: s.title,
              description: s.description,
              provider: s.provider,
              link: s.link,
              countries: s.countries || [],
              level: s.level || ['MASTER'],
              fields: s.fields || [],
              type: s.type || 'COMPLETE',
              languages: s.languages || ['FR'],
              deadline: s.deadline,
              benefits: s.benefits || [],
              requirements: s.requirements || null,
              source: s.source,
              scrapedAt: new Date(),
              status: 'PENDING',   // ← En attente de validation admin
              isActive: false,     // ← Pas visible dans l'app tant que non approuvé
            },
          })

          results.inserted++
        } catch (e) {
          results.errors++
          logger.warn(`Erreur insertion "${s.title}": ${e.message}`)
        }
      }
    } catch (e) {
      results.errors++
      logger.error(`Erreur scraper ${scraper.name}: ${e.message}`)
    }
  }

  logger.info(`✅ Scraping terminé — Total: ${results.total}, Insérées: ${results.inserted}, Doublons: ${results.duplicates}, Erreurs: ${results.errors}`)
  return results
}

const getScrapingStats = async () => {
  const [pending, approved, rejected, total] = await Promise.all([
    prisma.scholarship.count({ where: { status: 'PENDING' } }),
    prisma.scholarship.count({ where: { status: 'APPROVED' } }),
    prisma.scholarship.count({ where: { status: 'REJECTED' } }),
    prisma.scholarship.count({ where: { scrapedAt: { not: null } } }),
  ])
  return { pending, approved, rejected, total }
}

module.exports = { runScraping, getScrapingStats }