const prisma = require('../../config/db')
const logger = require('../../utils/logger')

const Scholars4DevScraper = require('./scrapers/scholars4dev')
const AfterSchoolAfricaScraper = require('./scrapers/afterschoolafrica')
const AfriCarrieresScraper = require('./scrapers/afri-carrieres')
const GreatyopScraper = require('./scrapers/greatyop')
const OpportunitiesForAfricansScraper = require('./scrapers/opportunitiesforafricans')

const { discoverCandidates } = require('./services/google-discovery')
const { fetchCleanText } = require('./services/page-fetcher')
const { extractScholarship } = require('./services/ai-extractor')
const { ALL_AFRICAN_COUNTRY_CODES } = require('./services/constants')

// OpportunityDesk (404 — page supprimée), ScholarshipDB et DAAD (teaser page,
// 403 — bloquent maintenant les bots) sont retirés de la liste active.
// Remplacés avantageusement par Afri-Carrières/Greatyop/OpportunitiesForAfricans
// qui à eux trois ramènent largement plus de volume. DAAD garde son fichier
// (à retravailler plus tard sur leur vraie base de données, cf. discussion).
const LISTING_SCRAPERS = [
  new AfterSchoolAfricaScraper(),
  new Scholars4DevScraper(),
  new AfriCarrieresScraper(),
  new GreatyopScraper(),
  new OpportunitiesForAfricansScraper(),
]

// Nombre de pages traitées en parallèle (fetch + appel IA) — volontairement
// bas car le tier gratuit Groq limite à 12000 tokens/minute ; à 2 en parallèle
// on reste sous la limite même avec le retry-backoff du module llm.js.
const CONCURRENCY = 2
// Sécurité anti-emballement : plafond de candidats traités par exécution.
const MAX_CANDIDATES_PER_RUN = parseInt(process.env.SCRAPER_MAX_CANDIDATES || '150', 10)

function normalizeLink(link) {
  try {
    const u = new URL(link)
    u.hash = ''
    u.search = ''
    return u.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return link.toLowerCase().trim()
  }
}

async function collectCandidateLinks() {
  const all = []

  // 1. Sources connues (sites spécialisés bourses)
  for (const scraper of LISTING_SCRAPERS) {
    try {
      const links = await scraper.scrapeLinks()
      all.push(...links)
    } catch (e) {
      logger.error(`[scraper.service] Erreur listing ${scraper.name}: ${e.message}`)
    }
  }

  // 2. Découverte élargie via Google Custom Search (nouvelles sources non répertoriées)
  try {
    const discovered = await discoverCandidates()
    all.push(...discovered)
  } catch (e) {
    logger.error(`[scraper.service] Erreur google-discovery: ${e.message}`)
  }

  // Déduplication par URL normalisée
  const seen = new Set()
  const deduped = []
  for (const c of all) {
    const key = normalizeLink(c.link)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ ...c, normalizedLink: key })
  }
  return deduped
}

async function filterAlreadyKnown(candidates) {
  const existingLinks = await prisma.scholarship.findMany({ select: { link: true } })
  const knownSet = new Set(existingLinks.map((s) => normalizeLink(s.link)))
  return candidates.filter((c) => !knownSet.has(c.normalizedLink))
}

// Petit pool de concurrence maison (évite d'ajouter une dépendance externe)
async function runWithConcurrency(items, worker, limit) {
  const results = []
  let index = 0
  async function next() {
    while (index < items.length) {
      const current = items[index++]
      results.push(await worker(current))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  return results
}

function expandCountries(countries) {
  if (Array.isArray(countries) && countries.includes('ALL_AFRICA')) {
    return ALL_AFRICAN_COUNTRY_CODES
  }
  return countries || []
}

const executeScraping = async () => {
  logger.info('🔍 Démarrage du scraping automatique (pipeline IA)...')
  const results = {
    candidatesFound: 0,
    alreadyKnown: 0,
    processed: 0,
    inserted: 0,
    autoPublished: 0,
    sentToReview: 0,
    notAScholarship: 0,
    duplicates: 0,
    lowConfidenceInserted: 0,
    errors: 0,
  }

  const candidates = await collectCandidateLinks()
  results.candidatesFound = candidates.length

  const newCandidates = await filterAlreadyKnown(candidates)
  results.alreadyKnown = candidates.length - newCandidates.length

  const toProcess = newCandidates.slice(0, MAX_CANDIDATES_PER_RUN)
  logger.info(`[scraper.service] ${toProcess.length} nouvelles pages à analyser (sur ${newCandidates.length} candidates, plafond ${MAX_CANDIDATES_PER_RUN})`)

  // Réserve immédiatement les couples titre/fournisseur pour éviter les doublons
  // lorsque deux URLs différentes décrivent la même bourse pendant ce run.
  const seenSemanticKeys = new Set()

  await runWithConcurrency(toProcess, async (candidate) => {
    try {
      const page = await fetchCleanText(candidate.link)
      if (!page) {
        results.errors++
        return
      }

      const extracted = await extractScholarship({
        url: candidate.link,
        pageTitle: page.title || candidate.title,
        text: page.text,
      })

      results.processed++

      if (!extracted) {
        results.notAScholarship++
        return
      }

      // Anti-doublon sémantique : même titre + même provider en base ou dans ce run.
      const semanticKey = `${(extracted.title || '').trim().toLowerCase().replace(/\\s+/g, ' ')}::${(extracted.provider || '').trim().toLowerCase().replace(/\\s+/g, ' ')}`
      if (seenSemanticKeys.has(semanticKey)) {
        results.duplicates++
        return
      }
      seenSemanticKeys.add(semanticKey)

      const existing = await prisma.scholarship.findFirst({
        where: {
          title: { equals: extracted.title, mode: 'insensitive' },
          provider: { equals: extracted.provider, mode: 'insensitive' },
        },
      })
      if (existing) {
        results.duplicates++
        return
      }

      // Une deadline absente reste null : aucune date artificielle n'est créée.
      const deadline = extracted.deadline
      const extractionNotes = extracted.extractionNotes
      const confidenceScore = extracted.confidenceScore

      // Publication automatique uniquement si les informations essentielles sont solides.
      // Une deadline absente n'empêche pas la publication si le reste est fiable.
      const canAutoPublish = confidenceScore >= 0.85
        && extracted.providerWasExtracted
        && extracted.descriptionWasExtracted
        && extracted.typeIsExplicit
        && extracted.countries.length > 0
      const publicationStatus = canAutoPublish ? 'APPROVED' : 'PENDING'

      await prisma.scholarship.create({
        data: {
          title: extracted.title,
          description: extracted.description,
          provider: extracted.provider,
          link: candidate.link,
          countries: expandCountries(extracted.countries),
          level: extracted.level.length ? extracted.level : [],
          fields: extracted.fields,
          type: extracted.type,
          typeDetails: extracted.typeDetails,
          languages: extracted.languages.length ? extracted.languages : [],
          amount: extracted.amount,
          currency: extracted.currency || 'USD',
          deadline,
          benefits: extracted.benefits,
          requirements: extracted.requirements,
          source: candidate.source,
          scrapedAt: new Date(),
          status: publicationStatus,
          isActive: canAutoPublish,
          confidenceScore,
          rawExcerpt: extracted.rawExcerpt,
          extractionNotes,
        },
      })

      results.inserted++
      if (canAutoPublish) results.autoPublished++
      else results.sentToReview++
      if (confidenceScore < 0.5) results.lowConfidenceInserted++
    } catch (e) {
      results.errors++
      logger.warn(`[scraper.service] Erreur traitement "${candidate.link}": ${e.message}`)
    }
  }, CONCURRENCY)

  logger.info(
    `✅ Scraping IA terminé — Candidats: ${results.candidatesFound}, Déjà connus: ${results.alreadyKnown}, ` +
    `Analysés: ${results.processed}, Insérés: ${results.inserted}, Publiés automatiquement: ${results.autoPublished}, ` +
    `En attente de revue: ${results.sentToReview}, Faible confiance: ${results.lowConfidenceInserted}, ` +
    `Non-bourses: ${results.notAScholarship}, Doublons: ${results.duplicates}, Erreurs: ${results.errors}`
  )
  return results
}

/*
 * Verrou local au processus : empêche un lancement manuel et le cron
 * de traiter les mêmes candidats simultanément sur cette instance Node.js.
 * Pour plusieurs instances serveur, un verrou partagé en base/Redis sera nécessaire.
 */
let scrapingInProgress = false

const runScraping = async () => {
  if (scrapingInProgress) {
    logger.warn('[scraper.service] Exécution ignorée : un scraping est déjà en cours sur cette instance')
    return { skipped: true, reason: 'SCRAPING_ALREADY_RUNNING' }
  }

  scrapingInProgress = true
  try {
    return await executeScraping()
  } finally {
    scrapingInProgress = false
    logger.info('[scraper.service] Verrou de scraping libéré')
  }
}

const getScrapingStats = async () => {
  const [pending, approved, rejected, total, avgConfidence] = await Promise.all([
    prisma.scholarship.count({ where: { status: 'PENDING' } }),
    prisma.scholarship.count({ where: { status: 'APPROVED' } }),
    prisma.scholarship.count({ where: { status: 'REJECTED' } }),
    prisma.scholarship.count({ where: { scrapedAt: { not: null } } }),
    prisma.scholarship.aggregate({
      where: { scrapedAt: { not: null }, confidenceScore: { not: null } },
      _avg: { confidenceScore: true },
    }),
  ])
  return {
    pending,
    approved,
    rejected,
    total,
    avgConfidence: avgConfidence._avg.confidenceScore,
  }
}

module.exports = { runScraping, getScrapingStats }
