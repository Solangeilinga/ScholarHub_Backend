const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class AfterSchoolAfricaScraper extends BaseScraper {
  constructor() {
    super('AfterSchoolAfrica', 'https://www.afterschoolafrica.com')
  }

  // Ne retourne QUE des liens candidats {title, link, source} —
  // l'extraction fine des données se fait ensuite par l'IA sur la page détail.
  async scrapeLinks() {
    logger.info(`[${this.name}] Recherche de liens candidats...`)
    const links = []

    const urls = [
      `${this.baseUrl}/scholarship/`,
      `${this.baseUrl}/scholarship/by-country/scholarships-in-africa/`,
      `${this.baseUrl}/scholarship/page/2/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('article, .post, .entry').each((_, el) => {
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

module.exports = AfterSchoolAfricaScraper
