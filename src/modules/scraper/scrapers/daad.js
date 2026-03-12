const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class DAADScraper extends BaseScraper {
  constructor() {
    super('DAAD', 'https://www.daad.de')
  }

  async scrape() {
    logger.info(`[${this.name}] Début du scraping...`)
    const scholarships = []

    const url = 'https://www.daad.de/en/studying-in-germany/scholarships/daad-scholarships/'
    const $ = await this.fetchPage(url)
    if (!$) return scholarships

    $('[class*="teaser"], [class*="card"], article, .scholarship-item').each((_, el) => {
      try {
        const title = $(el).find('h2, h3, h4, [class*="title"]').first().text().trim()
        const link = $(el).find('a').first().attr('href')
        const desc = $(el).find('p, [class*="desc"], [class*="text"]').first().text().trim()

        if (!title || title.length < 5) return

        const fullLink = link?.startsWith('http') ? link : `https://www.daad.de${link}`

        scholarships.push({
          title: title.substring(0, 200),
          description: desc || title,
          provider: 'DAAD',
          link: fullLink || url,
          countries: ['BF', 'CI', 'SN', 'ML', 'GN', 'TG', 'BJ', 'NE', 'CM', 'CD', 'GH', 'NG', 'KE', 'ET', 'ZA', 'MA', 'TN', 'DZ', 'EG'],
          level: this.parseLevel(title + ' ' + desc),
          type: 'COMPLETE',
          languages: ['en', 'fr'],
          deadline: null,
          benefits: ['Frais de scolarité couverts', 'Allocation mensuelle', 'Assurance maladie'],
          requirements: null,
          source: url,
        })
      } catch (e) {
        logger.warn(`[${this.name}] Erreur: ${e.message}`)
      }
    })

    logger.info(`[${this.name}] ${scholarships.length} bourses collectées`)
    return scholarships
  }
}

module.exports = DAADScraper