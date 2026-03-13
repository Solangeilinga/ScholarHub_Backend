const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class ScholarshipDBScraper extends BaseScraper {
  constructor() {
    super('ScholarshipDB', 'https://scholarshipdb.net')
  }

  async scrape() {
    logger.info(`[${this.name}] Début du scraping...`)
    const scholarships = []

    const urls = [
      `${this.baseUrl}/scholarships-in-Africa`,
      `${this.baseUrl}/scholarships/Page-2?q=africa`,
      `${this.baseUrl}/scholarships/Page-3?q=africa`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('li.list-group-item, .scholarship-item, article, .card').each((_, el) => {
        try {
          const title = $(el).find('a, h2, h3, h4').first().text().trim()
          const link = $(el).find('a').first().attr('href')
          const text = $(el).text()

          if (!title || title.length < 10) return

          const fullLink = link?.startsWith('http') ? link : `${this.baseUrl}${link}`

          scholarships.push({
            title: title.substring(0, 200),
            description: text.substring(0, 500).trim(),
            provider: this.extractProvider(title) || 'ScholarshipDB',
            link: fullLink,
            countries: this.parseCountries(text),
            level: this.parseLevel(text),
            type: this.parseType(text),
            languages: this.parseLanguages(text),
            fields: this.parseFields(text),
            deadline: this.parseDeadline(text),
            benefits: [],
            requirements: null,
            source: url,
          })
        } catch (e) {
          logger.warn(`[${this.name}] Erreur: ${e.message}`)
        }
      })

      await new Promise(r => setTimeout(r, 2000))
    }

    logger.info(`[${this.name}] ${scholarships.length} bourses collectées`)
    return scholarships
  }

  extractProvider(title) {
    const providers = ['Erasmus', 'UNESCO', 'DAAD', 'Fulbright', 'Commonwealth', 'World Bank', 'ADB', 'AfDB', 'Gates', 'Mastercard', 'Chevening']
    for (const p of providers) {
      if (title.includes(p)) return p
    }
    return null
  }
}

module.exports = ScholarshipDBScraper