const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class OpportunitiesForAfricansScraper extends BaseScraper {
  constructor() {
    super('OpportunitiesForAfricans', 'https://www.opportunitiesforafricans.com')
  }

  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/category/scholarships/`,
      `${this.baseUrl}/category/scholarships/page/2/`,
      `${this.baseUrl}/category/scholarships/page/3/`,
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

module.exports = OpportunitiesForAfricansScraper
