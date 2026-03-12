const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class CampusFranceScraper extends BaseScraper {
  constructor() {
    super('CampusFrance', 'https://www.campusfrance.org')
  }

  async scrape() {
    logger.info(`[${this.name}] Début du scraping...`)
    const scholarships = []

    const urls = [
      `${this.baseUrl}/fr/page/les-bourses-du-gouvernement-francais`,
      `${this.baseUrl}/fr/page/les-bourses-dexcellence-eiffel`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      // Campus France structure spécifique
      $('[class*="bourse"], [class*="scholarship"], .field-item, .views-row').each((_, el) => {
        try {
          const title = $(el).find('h2, h3, .title, [class*="title"]').first().text().trim()
          const link = $(el).find('a').first().attr('href')
          const desc = $(el).find('p, .description, [class*="desc"]').first().text().trim()

          if (!title || title.length < 5) return

          const fullLink = link?.startsWith('http') ? link : `${this.baseUrl}${link}`

          scholarships.push({
            title: title.substring(0, 200),
            description: desc || title,
            provider: 'Campus France',
            link: fullLink || url,
            countries: ['BF', 'CI', 'SN', 'ML', 'GN', 'TG', 'BJ', 'NE', 'CM', 'CD', 'MA', 'TN', 'DZ'],
            level: this.parseLevel(title + ' ' + desc),
            type: title.toLowerCase().includes('eiffel') ? 'COMPLETE' : 'PARTIELLE',
            languages: ['fr'],
            deadline: null,
            benefits: [],
            requirements: null,
            source: url,
          })
        } catch (e) {
          logger.warn(`[${this.name}] Erreur élément: ${e.message}`)
        }
      })
    }

    logger.info(`[${this.name}] ${scholarships.length} bourses collectées`)
    return scholarships
  }
}

module.exports = CampusFranceScraper