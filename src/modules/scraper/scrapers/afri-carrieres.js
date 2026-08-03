const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class AfriCarrieresScraper extends BaseScraper {
  constructor() {
    super('Afri-Carrieres', 'https://afri-carrieres.com')
  }

  // Portail généraliste (bourses + emplois + concours...), on ne cible que
  // la catégorie "Bourses d'études" pour ne pas polluer avec le reste.
  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/type/bourses-detudes/`,
      `${this.baseUrl}/type/bourses-detudes/page/2/`,
      `${this.baseUrl}/type/bourses-detudes/page/3/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('article, .card, [class*="opportunity"]').each((_, el) => {
        const title = $(el).find('h2 a, h3 a').first().text().trim()
        const link = $(el).find('h2 a, h3 a').first().attr('href')
        if (!title || title.length < 10 || !link) return
        links.push({ title, link, source: this.name })
      })

      // Fallback si la structure de cartes n'a rien donné : liens directs /opportunites/
      if (links.length === 0) {
        $('a[href*="/opportunites/"]').each((_, el) => {
          const title = $(el).text().trim()
          const link = $(el).attr('href')
          if (!title || title.length < 10 || !link) return
          links.push({ title, link, source: this.name })
        })
      }

      await new Promise((r) => setTimeout(r, 1500))
    }

    logger.info(`[${this.name}] ${links.length} liens candidats trouvés`)
    return links
  }
}

module.exports = AfriCarrieresScraper
