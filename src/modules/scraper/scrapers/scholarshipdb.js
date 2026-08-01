const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class ScholarshipDBScraper extends BaseScraper {
  constructor() {
    super('ScholarshipDB', 'https://scholarshipdb.net')
  }

  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/scholarships-in-Africa`,
      `${this.baseUrl}/scholarships/Page-2?q=africa`,
      `${this.baseUrl}/scholarships/Page-3?q=africa`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('li.list-group-item, .scholarship-item, article, .card').each((_, el) => {
        const title = $(el).find('a, h2, h3, h4').first().text().trim()
        const link = $(el).find('a').first().attr('href')
        if (!title || title.length < 10 || !link) return
        const fullLink = link.startsWith('http') ? link : `${this.baseUrl}${link}`
        links.push({ title, link: fullLink, source: this.name })
      })

      await new Promise((r) => setTimeout(r, 1500))
    }

    logger.info(`[${this.name}] ${links.length} liens candidats trouvés`)
    return links
  }
}

module.exports = ScholarshipDBScraper
