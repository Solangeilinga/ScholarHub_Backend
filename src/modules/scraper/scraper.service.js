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
const { hasProvider: hasAiProvider } = require('../../utils/llm')
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
const configuredMaxCandidates = Number.parseInt(process.env.SCRAPER_MAX_CANDIDATES || '150', 10)
const MAX_CANDIDATES_PER_RUN = Number.isFinite(configuredMaxCandidates)
  ? Math.min(500, Math.max(1, configuredMaxCandidates))
  : 150

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

  // 2. Découverte élargie via recherche Web (Brave prioritaire, Google en transition)
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

async function filterAlreadyKnown(candidates, existingScholarships) {
  const knownSet = new Set(existingScholarships.map((s) => normalizeLink(s.link)))
  return candidates.filter((c) => !knownSet.has(c.normalizedLink))
}

// Normalise les titres et organismes pour comparer les annonces malgré
// les accents, la ponctuation, les mots génériques et de petites variantes.
function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const GENERIC_TITLE_WORDS = new Set([
  'scholar', 'scholars', 'scholarship', 'scholarships', 'bourse', 'bourses', 'grant', 'grants',
  'funding', 'opportunity', 'opportunities', 'programme', 'program',
  '2025', '2026', '2027', '2028', '2029',
])

function meaningfulTokens(value, removeGeneric = false) {
  const tokens = normalizeComparableText(value).split(' ').filter((token) => token.length > 1)
  return [...new Set(removeGeneric ? tokens.filter((token) => !GENERIC_TITLE_WORDS.has(token)) : tokens)]
}

function tokenSimilarity(a, b, removeGeneric = false) {
  const left = meaningfulTokens(a, removeGeneric)
  const right = meaningfulTokens(b, removeGeneric)
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right)
  const intersection = left.filter((token) => rightSet.has(token)).length
  return intersection / new Set([...left, ...right]).size
}

function bigramSimilarity(a, b) {
  const left = normalizeComparableText(a).replace(/ /g, '')
  const right = normalizeComparableText(b).replace(/ /g, '')
  if (left.length < 2 || right.length < 2) return left === right && left.length > 0 ? 1 : 0
  const makeBigrams = (value) => {
    const pairs = []
    for (let i = 0; i < value.length - 1; i++) pairs.push(value.slice(i, i + 2))
    return pairs
  }
  const leftPairs = makeBigrams(left)
  const rightPairs = makeBigrams(right)
  const counts = new Map()
  for (const pair of leftPairs) counts.set(pair, (counts.get(pair) || 0) + 1)
  let intersection = 0
  for (const pair of rightPairs) {
    const count = counts.get(pair) || 0
    if (count > 0) {
      intersection++
      counts.set(pair, count - 1)
    }
  }
  return (2 * intersection) / (leftPairs.length + rightPairs.length)
}

function isLikelySameScholarship(candidate, existing) {
  const candidateTitle = normalizeComparableText(candidate.title)
  const existingTitle = normalizeComparableText(existing.title)
  const candidateProvider = normalizeComparableText(candidate.provider)
  const existingProvider = normalizeComparableText(existing.provider)
  if (!candidateTitle || !existingTitle || !candidateProvider || !existingProvider) return false

  const sameProvider = candidateProvider === existingProvider
    || tokenSimilarity(candidateProvider, existingProvider) >= 0.85
    || bigramSimilarity(candidateProvider, existingProvider) >= 0.90
  if (!sameProvider) return false
  if (candidateTitle === existingTitle) return true

  const titleTokenScore = tokenSimilarity(candidateTitle, existingTitle, true)
  const titleBigramScore = bigramSimilarity(candidateTitle, existingTitle)
  return (titleTokenScore >= 0.88 && titleBigramScore >= 0.60)
    || titleBigramScore >= 0.94
}

function findLikelyDuplicate(extracted, existingScholarships) {
  return existingScholarships.find((existing) => isLikelySameScholarship({
    title: extracted.title,
    provider: extracted.provider,
  }, existing)) || null
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

// Seules les sources explicitement reconnues peuvent alimenter la publication
// automatique. Les autres restent consultables dans la file de modération.
const TRUSTED_SOURCE_DOMAINS = [
  'campusfrance.org', 'diplomatie.gouv.fr', 'erasmus-plus.ec.europa.eu',
  'daad.de', 'chevening.org', 'mastercardfdn.org', 'au.int', 'auf.org',
  'scholars4dev.com', 'afterschoolafrica.com', 'afri-carrieres.com',
  'greatyop.com', 'opportunitiesforafricans.com',
]

function getSourceTrust(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (TRUSTED_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain))) {
      return 'TRUSTED'
    }
    return 'UNVERIFIED'
  } catch {
    return 'INVALID'
  }
}

function hasReliableExtraction(extracted) {
  const validCountries = new Set(ALL_AFRICAN_COUNTRY_CODES)
  const countriesAreValid = Array.isArray(extracted.countries)
    && extracted.countries.length > 0
    && extracted.countries.every((country) => country === 'ALL_AFRICA' || validCountries.has(country))
  const descriptionIsUseful = typeof extracted.description === 'string'
    && extracted.description.trim().length >= 80
  const titleIsSpecific = typeof extracted.title === 'string'
    && extracted.title.trim().length >= 8
    && !/^(scholarship|bourse|opportunity|opportunité|home|accueil|latest news)$/i.test(extracted.title.trim())

  return countriesAreValid && descriptionIsUseful && titleIsSpecific
}

const executeScraping = async () => {
  logger.info('🔍 Démarrage du scraping automatique (pipeline IA)...')
  if (!hasAiProvider) {
    logger.error('[scraper.service] Scraping incomplet : aucune clé GROQ_API_KEY ou GEMINI_API_KEY configurée. Les pages ne pourront pas être extraites.')
  }
  if (!process.env.BRAVE_SEARCH_API_KEY && !(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX)) {
    logger.warn('[scraper.service] Découverte Web élargie désactivée : configurer BRAVE_SEARCH_API_KEY (ou temporairement Google CSE). Les sources intégrées restent actives.')
  }
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

  const existingScholarships = await prisma.scholarship.findMany({
    select: { id: true, link: true, title: true, provider: true },
  })
  const newCandidates = await filterAlreadyKnown(candidates, existingScholarships)
  results.alreadyKnown = candidates.length - newCandidates.length

  const toProcess = newCandidates.slice(0, MAX_CANDIDATES_PER_RUN)
  logger.info(`[scraper.service] ${toProcess.length} nouvelles pages à analyser (sur ${newCandidates.length} candidates, plafond ${MAX_CANDIDATES_PER_RUN})`)

  // Annonces déjà en base et réservations de ce run, pour éviter les doublons
  // entre plusieurs URLs même lorsque les titres ne sont pas strictement identiques.
  const knownScholarships = [...existingScholarships]

  await runWithConcurrency(toProcess, async (candidate) => {
    let reservedScholarship = null
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

      // Détection tolérante : titres proches + organisme identique ou très proche.
      // Réservation synchrone avant le prochain await pour gérer la concurrence.
      const duplicate = findLikelyDuplicate(extracted, knownScholarships)
      if (duplicate) {
        results.duplicates++
        logger.info(`[scraper.service] Doublon probable ignoré : "${extracted.title}" (annonce existante ${duplicate.id || 'dans ce run'})`)
        return
      }
      reservedScholarship = { title: extracted.title, provider: extracted.provider }
      knownScholarships.push(reservedScholarship)

      // Une deadline absente reste null : aucune date artificielle n'est créée.
      const deadline = extracted.deadline
      const extractionNotes = extracted.extractionNotes
      const confidenceScore = extracted.confidenceScore

      const sourceTrust = getSourceTrust(candidate.link)
      const extractionIsReliable = hasReliableExtraction(extracted)
      const deadlineIsSafe = !extracted.deadlineWasPast

      // Publication automatique réservée aux domaines reconnus et aux annonces
      // complètes, cohérentes et non expirées. Toute incertitude = revue humaine.
      const canAutoPublish = confidenceScore >= 0.90
        && sourceTrust === 'TRUSTED'
        && extractionIsReliable
        && extracted.providerWasExtracted
        && extracted.descriptionWasExtracted
        && extracted.typeIsExplicit
        && deadlineIsSafe
      const publicationStatus = canAutoPublish ? 'APPROVED' : 'PENDING'

      if (sourceTrust !== 'TRUSTED') {
        logger.info(`[scraper.service] Source non vérifiée — revue humaine requise : ${candidate.link}`)
      }
      if (extracted.deadlineWasPast) {
        logger.info(`[scraper.service] Annonce avec deadline passée — revue humaine requise : ${candidate.link}`)
      }
      if (!extractionIsReliable) {
        logger.info(`[scraper.service] Informations insuffisantes ou incohérentes — revue humaine requise : ${candidate.link}`)
      }

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
      if (reservedScholarship) {
        const reservationIndex = knownScholarships.indexOf(reservedScholarship)
        if (reservationIndex !== -1) knownScholarships.splice(reservationIndex, 1)
      }
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
    automation: {
      aiExtractionReady: hasAiProvider,
      webDiscoveryReady: Boolean(process.env.BRAVE_SEARCH_API_KEY || (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX)),
      discoveryProvider: process.env.BRAVE_SEARCH_API_KEY ? 'BRAVE' :
        (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX ? 'GOOGLE_CSE' : 'NONE'),
      activeSources: LISTING_SCRAPERS.map((scraper) => scraper.name),
      maxCandidatesPerRun: MAX_CANDIDATES_PER_RUN,
      schedule: 'Tous les jours à 03:00 (Africa/Abidjan)',
    },
  }
}

module.exports = { runScraping, getScrapingStats }
