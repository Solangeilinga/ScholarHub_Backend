const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class Scholars4DevScraper extends BaseScraper {
  constructor() {
    super('Scholars4Dev', 'https://www.scholars4dev.com')
  }

  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/category/scholarship-by-region/africa-scholarships/`,
      `${this.baseUrl}/category/scholarship-by-region/africa-scholarships/page/2/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('article, .post').each((_, el) => {
        const title = $(el).find('h2 a, h3 a, .entry-title a').first().text().trim()
        const link = $(el).find('h2 a, h3 a, .entry-title a').first().attr('href')
        if (!title || title.length < 10 || !link) return
        links.push({ title, link, source: this.name })
      })

      await new Promise((r) => setTimeout(r, 1500))
    }

    logger.info(`[${this.name}] ${links.length} liens candidats trouvés`)
    return links
  }
}

module.exports = Scholars4DevScraper
