const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class DAADScraper extends BaseScraper {
  constructor() {
    super('DAAD', 'https://www.daad.de')
  }

  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const url = 'https://www.daad.de/en/studying-in-germany/scholarships/daad-scholarships/'
    const $ = await this.fetchPage(url)
    if (!$) return links

    $('[class*="teaser"], [class*="card"], article, .scholarship-item').each((_, el) => {
      const title = $(el).find('h2, h3, h4, [class*="title"]').first().text().trim()
      const href = $(el).find('a').first().attr('href')
      if (!title || title.length < 5 || !href) return
      const fullLink = href.startsWith('http') ? href : `https://www.daad.de${href}`
      links.push({ title, link: fullLink, source: this.name })
    })

    logger.info(`[${this.name}] ${links.length} liens candidats trouvés`)
    return links
  }
}

module.exports = DAADScraper
