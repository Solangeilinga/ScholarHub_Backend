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
  return [
    `bourse d'études Afrique ${year} deadline candidature`,
    `scholarship for African students ${year} deadline apply`,
    `bourse master doctorat Afrique ${year}`,
    `fully funded scholarship Africa application deadline ${year}`,
    `bourse gouvernementale étudiants africains ${year}`,
    `scholarship for African students ${nextYear} applications`,
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
