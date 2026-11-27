const axios = require('axios')
const logger = require('../../../utils/logger')

/**
 * Découverte de nouvelles pages de bourses via l'API officielle
 * Google Custom Search (Programmable Search Engine).
 *
 * ⚠️ On n'utilise volontairement PAS le scraping direct des pages de résultats
 * Google (google.com/search) : c'est contraire à ses CGU et bloqué par des
 * mesures anti-bot. L'API officielle est gratuite jusqu'à 100 requêtes/jour.
 *
 * Configuration requise (voir .env.example) :
 * - GOOGLE_CSE_API_KEY : clé API (console.cloud.google.com → Custom Search API)
 * - GOOGLE_CSE_CX      : ID du moteur de recherche programmable
 *   (programmablesearchengine.google.com, configuré pour chercher "tout le web")
 */

const ENDPOINT = 'https://www.googleapis.com/customsearch/v1'

// Domaines à ne jamais retenir comme "source de bourse" : réseaux sociaux,
// agrégateurs vidéo, etc. — trop peu fiables ou hors périmètre légal/technique.
const EXCLUDED_DOMAINS = [
  'facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'youtube.com', 'pinterest.com', 'reddit.com',
]

// Requêtes ciblées — à enrichir/ajuster selon les retours de qualité observés
function getSearchQueries() {
  const year = new Date().getFullYear()
  const nextYear = year + 1

  // Couverture multilingue et régionale : Afrique francophone, anglophone,
  // lusophone, Afrique du Nord, de l'Est, de l'Ouest, centrale et australe.
  return [
    // Requêtes générales historiques.
    `bourse d'études Afrique ${year} deadline candidature`,
    `scholarship for African students ${year} deadline apply`,
    `bourse master doctorat Afrique ${year}`,
    `fully funded scholarship Africa application deadline ${year}`,
    `bourse gouvernementale étudiants africains ${year}`,
    `scholarship for African students ${nextYear} applications`,

    // Répertoires et programmes institutionnels internationaux.
    `site:campusfrance.org CampusBourses bourses étudiants internationaux ${year}`,
    `site:diplomatie.gouv.fr bourses étudiants étrangers appels candidature ${year}`,
    `site:erasmus-plus.ec.europa.eu Erasmus Mundus scholarships applications ${year} ${nextYear}`,
    `site:daad.de scholarships African students ${year} ${nextYear}`,
    `site:chevening.org scholarships applications ${year} ${nextYear}`,
    `site:mastercardfdn.org "Scholars Program" university application ${year} ${nextYear}`,
    `site:au.int scholarships African Union students applications ${year} ${nextYear}`,
    `site:auf.org bourses étudiants Afrique appels candidature ${year} ${nextYear}`,

    // Afrique de l'Ouest et centrale francophone.
    `bourses étudiants Burkina Faso Côte d'Ivoire Sénégal Mali Bénin Togo ${year} ${nextYear}`,
    `appel à candidatures bourse université Afrique francophone master doctorat ${year}`,
    `bourse gouvernementale Cameroun Gabon Niger Guinée Tchad étudiants ${year} ${nextYear}`,

    // Afrique anglophone, orientale et australe.
    `scholarships Nigeria Ghana Kenya Uganda Rwanda Tanzania African students ${year} ${nextYear}`,
    `scholarships South Africa Zambia Zimbabwe Botswana Malawi African students ${year} ${nextYear}`,
    `East Africa university government scholarships international students ${year} ${nextYear}`,

    // Afrique du Nord et espace lusophone.
    `bourses Maroc Algérie Tunisie Égypte étudiants africains ${year} ${nextYear}`,
    `bolsas de estudo Moçambique Angola estudantes africanos ${year} ${nextYear}`,

    // Universités et autorités publiques.
    `African university official website scholarship international African students ${year} ${nextYear}`,
    `African ministry higher education government scholarship call for applications ${year} ${nextYear}`,
  ]
}

// Google limite chaque page à 10 résultats et l'indexation à 100 résultats
// maximum par requête. Deux pages donnent jusqu'à 20 résultats par requête.
function getPagesPerQuery() {
  const configured = Number.parseInt(process.env.GOOGLE_CSE_PAGES_PER_QUERY || '2', 10)
  if (!Number.isFinite(configured)) return 2
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

async function discoverCandidates() {
  const apiKey = process.env.GOOGLE_CSE_API_KEY
  const cx = process.env.GOOGLE_CSE_CX

  if (!apiKey || !cx) {
    logger.warn('[google-discovery] GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX absents — découverte Google désactivée')
    return []
  }

  const candidates = []

  const pagesPerQuery = getPagesPerQuery()
  const queries = getSearchQueries()
  let requestsMade = 0

  for (const query of queries) {
    for (let page = 0; page < pagesPerQuery; page++) {
      const start = page * 10 + 1
      try {
        const { data } = await axios.get(ENDPOINT, {
          params: { key: apiKey, cx, q: query, num: 10, start },
          timeout: 15000,
        })
        requestsMade++

        for (const item of data.items || []) {
          if (!item.link || isExcluded(item.link)) continue
          candidates.push({
            title: item.title,
            link: item.link,
            source: 'google-discovery',
          })
        }

        // Arrête la pagination si Google n'a plus de page suivante.
        if (!data.queries?.nextPage?.length || !data.items?.length) break

        // Respecter le quota / éviter le rate-limit.
        await new Promise((r) => setTimeout(r, 500))
      } catch (e) {
        logger.warn(`[google-discovery] Erreur requête page ${page + 1} "${query}": ${e.response?.status || ''} ${e.message}`)
        break
      }
    }
  }

  logger.info(
    `[google-discovery] ${candidates.length} URLs candidates découvertes via Google — ` +
    `${queries.length} requêtes, ${requestsMade} appels API, ${pagesPerQuery} page(s) max/requête`
  )
  return candidates
}

module.exports = { discoverCandidates }
