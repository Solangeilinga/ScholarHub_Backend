const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class GreatyopScraper extends BaseScraper {
  constructor() {
    super('Greatyop', 'https://greatyop.com')
  }

  // On cible spécifiquement "Destination Afrique" ET la catégorie Bourses,
  // pour maximiser la pertinence pour des étudiants africains.
  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/destination/afrique/`,
      `${this.baseUrl}/destination/afrique/page/2/`,
      `${this.baseUrl}/destination/afrique/page/3/`,
      `${this.baseUrl}/category/bourses/`,
      `${this.baseUrl}/category/master/`,
      `${this.baseUrl}/category/licence/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('article, .post, [class*="post"]').each((_, el) => {
        const title = $(el).find('h2 a, h3 a').first().text().trim()
        const link = $(el).find('h2 a, h3 a').first().attr('href')
        if (!title || title.length < 8 || !link) return
        links.push({ title, link, source: this.name })
      })

      await new Promise((r) => setTimeout(r, 1500))
    }

    logger.info(`[${this.name}] ${links.length} liens candidats trouvés`)
    return links
  }
}

module.exports = GreatyopScraper
