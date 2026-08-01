const axios = require('axios')
const cheerio = require('cheerio')
const logger = require('../../../utils/logger')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

// Balises qui ne contiennent jamais d'information utile sur une bourse
const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header', 'noscript',
  'iframe', 'form', '.menu', '.navbar', '.comments', '.related-posts',
  '.sidebar', '.cookie-banner', '.share-buttons', '.advertisement',
]

/**
 * Récupère une page et retourne un texte "propre" exploitable par un LLM :
 * titre + contenu principal, sans navigation/pub/scripts.
 * Contrairement à l'ancien BaseScraper.fetchPage(), on ne se limite pas au
 * listing : on va chercher la page détail complète de l'annonce.
 */
async function fetchCleanText(url, { maxChars = 12000 } = {}) {
  try {
    const { data } = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    })

    const $ = cheerio.load(data)
    NOISE_SELECTORS.forEach((sel) => $(sel).remove())

    const pageTitle = $('title').first().text().trim()
    const h1 = $('h1').first().text().trim()

    // On privilégie le conteneur d'article s'il existe, sinon body entier
    const mainSelectors = ['article', 'main', '.entry-content', '.post-content', '.content', 'body']
    let text = ''
    for (const sel of mainSelectors) {
      const t = $(sel).first().text().replace(/\s+/g, ' ').trim()
      if (t.length > 200) {
        text = t
        break
      }
    }
    if (!text) text = $('body').text().replace(/\s+/g, ' ').trim()

    const fullText = `${h1 || pageTitle}\n\n${text}`.slice(0, maxChars)

    return { title: h1 || pageTitle, text: fullText, html$: $ }
  } catch (e) {
    logger.warn(`[page-fetcher] Échec fetch ${url}: ${e.message}`)
    return null
  }
}

module.exports = { fetchCleanText }
