const axios = require('axios')
const logger = require('../../../utils/logger')

// Découverte Web via Brave Search API (prioritaire), avec Google Custom Search
// conservé temporairement comme solution de transition jusqu'au 01/01/2027.

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const GOOGLE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1'

const EXCLUDED_DOMAINS = [
  'facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'youtube.com', 'pinterest.com', 'reddit.com',
]

function getSearchQueries() {
  const year = new Date().getFullYear()
  const nextYear = year + 1

  return [
    `bourse d'études Afrique ${year} deadline candidature`,
    `scholarship for African students ${year} deadline apply`,
    `bourse master doctorat Afrique ${year}`,
    `fully funded scholarship Africa application deadline ${year}`,
    `bourse gouvernementale étudiants africains ${year}`,
    `scholarship for African students ${nextYear} applications`,
    `site:campusfrance.org CampusBourses bourses étudiants internationaux ${year}`,
    `site:diplomatie.gouv.fr bourses étudiants étrangers appels candidature ${year}`,
    `site:erasmus-plus.ec.europa.eu Erasmus Mundus scholarships applications ${year} ${nextYear}`,
    `site:daad.de scholarships African students ${year} ${nextYear}`,
    `site:chevening.org scholarships applications ${year} ${nextYear}`,
    `site:mastercardfdn.org "Scholars Program" university application ${year} ${nextYear}`,
    `site:au.int scholarships African Union students applications ${year} ${nextYear}`,
    `site:auf.org bourses étudiants Afrique appels candidature ${year} ${nextYear}`,
    `bourses étudiants Burkina Faso Côte d'Ivoire Sénégal Mali Bénin Togo ${year} ${nextYear}`,
    `appel à candidatures bourse université Afrique francophone master doctorat ${year}`,
    `bourse gouvernementale Cameroun Gabon Niger Guinée Tchad étudiants ${year} ${nextYear}`,
    `scholarships Nigeria Ghana Kenya Uganda Rwanda Tanzania African students ${year} ${nextYear}`,
    `scholarships South Africa Zambia Zimbabwe Botswana Malawi African students ${year} ${nextYear}`,
    `East Africa university government scholarships international students ${year} ${nextYear}`,
    `bourses Maroc Algérie Tunisie Égypte étudiants africains ${year} ${nextYear}`,
    `bolsas de estudo Moçambique Angola estudantes africanos ${year} ${nextYear}`,
    `African university official website scholarship international African students ${year} ${nextYear}`,
    `African ministry higher education government scholarship call for applications ${year} ${nextYear}`,
  ]
}

function getPagesPerQuery(envName, defaultValue = 2) {
  const configured = Number.parseInt(process.env[envName] || String(defaultValue), 10)
  if (!Number.isFinite(configured)) return defaultValue
  return Math.min(10, Math.max(1, configured))
}

function isExcluded(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return true
  }
}

function toCandidate(item, source) {
  const link = item.url || item.link
  if (!link || isExcluded(link)) return null
  return {
    title: item.title || item.name || link,
    link,
    source,
  }
}

async function discoverWithBrave(apiKey, queries) {
  const candidates = []
  const pagesPerQuery = getPagesPerQuery('BRAVE_SEARCH_PAGES_PER_QUERY', 1)
  const configuredMax = Number.parseInt(process.env.BRAVE_SEARCH_MAX_REQUESTS_PER_RUN || '24', 10)
  const maxRequests = Number.isFinite(configuredMax)
    ? Math.min(48, Math.max(1, configuredMax))
    : 24
  let requestsMade = 0

  for (const query of queries) {
    if (requestsMade >= maxRequests) break

    for (let page = 0; page < pagesPerQuery && requestsMade < maxRequests; page++) {
      try {
        const { data } = await axios.get(BRAVE_ENDPOINT, {
          // La langue suit la requête : français, portugais ou anglais.
          // Aucun pays n'est forcé : les requêtes ciblent explicitement plusieurs régions.
          params: {
            q: query,
            count: 20,
            offset: page,
            search_lang: /(bolsas|estudo|estudantes)/i.test(query) ? 'pt'
              : /(bourse|étudiants|études|appel|université|gouvernementale|candidature|bourses)/i.test(query) ? 'fr'
                : 'en',
          },
          headers: { 'X-Subscription-Token': apiKey },
          timeout: 15000,
        })
        requestsMade++

        for (const item of data.web?.results || []) {
          const candidate = toCandidate(item, 'brave-discovery')
          if (candidate) candidates.push(candidate)
        }

        if (!data.query?.more_results_available || !(data.web?.results || []).length) break
        await new Promise((resolve) => setTimeout(resolve, 350))
      } catch (error) {
        logger.warn(`[web-discovery] Erreur Brave page ${page + 1} "${query}": ${error.response?.status || ''} ${error.message}`)
        break
      }
    }
  }

  logger.info(
    `[web-discovery] ${candidates.length} URLs candidates via Brave — ` +
    `${queries.length} requêtes, ${requestsMade}/${maxRequests} appels API maximum, ${pagesPerQuery} page(s) max/requête`
  )
  return candidates
}

async function discoverWithGoogle(apiKey, cx, queries) {
  const candidates = []
  const pagesPerQuery = getPagesPerQuery('GOOGLE_CSE_PAGES_PER_QUERY')
  let requestsMade = 0

  for (const query of queries) {
    for (let page = 0; page < pagesPerQuery; page++) {
      try {
        const { data } = await axios.get(GOOGLE_ENDPOINT, {
          params: { key: apiKey, cx, q: query, num: 10, start: page * 10 + 1 },
          timeout: 15000,
        })
        requestsMade++

        for (const item of data.items || []) {
          const candidate = toCandidate(item, 'google-discovery')
          if (candidate) candidates.push(candidate)
        }

        if (!data.queries?.nextPage?.length || !data.items?.length) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        logger.warn(`[web-discovery] Erreur Google page ${page + 1} "${query}": ${error.response?.status || ''} ${error.message}`)
        break
      }
    }
  }

  logger.info(
    `[web-discovery] ${candidates.length} URLs candidates via Google (mode transition) — ` +
    `${queries.length} requêtes, ${requestsMade} appels API, ${pagesPerQuery} page(s) max/requête`
  )
  return candidates
}

async function discoverCandidates() {
  const queries = getSearchQueries()
  const braveKey = process.env.BRAVE_SEARCH_API_KEY

  const googleKey = process.env.GOOGLE_CSE_API_KEY
  const googleCx = process.env.GOOGLE_CSE_CX

  // Brave est prioritaire dès qu'une clé est configurée.
  if (braveKey) {
    const braveCandidates = await discoverWithBrave(braveKey, queries)
    if (braveCandidates.length > 0) return braveCandidates

    // Si Brave ne renvoie aucun résultat (panne, quota ou réponse vide),
    // Google peut temporairement prendre le relais si ses identifiants existent.
    if (googleKey && googleCx) {
      logger.warn('[web-discovery] Aucun résultat Brave — bascule temporaire vers Google')
      return discoverWithGoogle(googleKey, googleCx, queries)
    }

    logger.warn('[web-discovery] Brave n’a renvoyé aucun résultat et aucun secours Google n’est configuré')
    return []
  }

  // Compatibilité temporaire avant la configuration de la clé Brave.
  if (googleKey && googleCx) return discoverWithGoogle(googleKey, googleCx, queries)

  logger.warn('[web-discovery] Aucune clé Brave ou Google configurée — découverte Web désactivée')
  return []
}

module.exports = { discoverCandidates }
