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

  // Les six requêtes générales historiques sont conservées.
  // Les requêtes suivantes ciblent des répertoires institutionnels et des
  // appels publiés par des universités, gouvernements et organismes africains.
  // Total : 16 requêtes Google CSE par exécution (sur le quota standard de 100/jour).
  return [
    `bourse d'études Afrique ${year} deadline candidature`,
    `scholarship for African students ${year} deadline apply`,
    `bourse master doctorat Afrique ${year}`,
    `fully funded scholarship Africa application deadline ${year}`,
    `bourse gouvernementale étudiants africains ${year}`,
    `scholarship for African students ${nextYear} applications`,

    // Répertoires officiels et programmes institutionnels internationaux.
    `site:campusfrance.org CampusBourses bourses étudiants internationaux ${year}`,
    `site:diplomatie.gouv.fr bourses étudiants étrangers appels candidature ${year}`,
    `site:erasmus-plus.ec.europa.eu Erasmus Mundus scholarships applications ${year} ${nextYear}`,
    `site:daad.de scholarships African students ${year} ${nextYear}`,
    `site:cscuk.fcdo.gov.uk OR site:chevening.org scholarships applications ${year} ${nextYear}`,
    `site:mastercardfdn.org OR "Mastercard Foundation Scholars Program" university application ${year} ${nextYear}`,

    // Sources africaines : institutions continentales, universités et ministères.
    `site:au.int scholarships African Union students applications ${year} ${nextYear}`,
    `site:auf.org bourses étudiants Afrique appels candidature ${year} ${nextYear}`,
    `African university official website scholarship international African students ${year} ${nextYear}`,
    `African ministry higher education government scholarship call for applications ${year} ${nextYear}`,
  ]
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

  for (const query of getSearchQueries()) {
    try {
      const { data } = await axios.get(ENDPOINT, {
        params: { key: apiKey, cx, q: query, num: 10 },
        timeout: 15000,
      })

      for (const item of data.items || []) {
        if (!item.link || isExcluded(item.link)) continue
        candidates.push({
          title: item.title,
          link: item.link,
          source: 'google-discovery',
        })
      }

      // Respecter le quota / éviter le rate-limit
      await new Promise((r) => setTimeout(r, 500))
    } catch (e) {
      logger.warn(`[google-discovery] Erreur requête "${query}": ${e.response?.status || ''} ${e.message}`)
    }
  }

  logger.info(`[google-discovery] ${candidates.length} URLs candidates découvertes via Google`)
  return candidates
}

module.exports = { discoverCandidates }
