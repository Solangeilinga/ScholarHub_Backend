const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class Scholars4DevScraper extends BaseScraper {
  constructor() {
    super('Scholars4Dev', 'https://www.scholars4dev.com')
  }

  async scrape() {
    logger.info(`[${this.name}] Début du scraping...`)
    const scholarships = []

    const urls = [
      `${this.baseUrl}/category/scholarship-by-region/africa-scholarships/`,
      `${this.baseUrl}/category/scholarship-by-region/africa-scholarships/page/2/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      $('article, .post, h2.entry-title').each((_, el) => {
        try {
          const title = $(el).find('h2 a, h3 a, .entry-title a, a').first().text().trim()
          const link = $(el).find('a').first().attr('href')
          const excerpt = $(el).find('.entry-summary, .excerpt, p').first().text().trim()
          const dateText = $(el).find('time').first().attr('datetime') || ''

          if (!title || title.length < 10) return

          scholarships.push({
            title: title.substring(0, 200),
            description: excerpt || title,
            provider: this.extractProvider(title) || 'Scholars4Dev',
            link: link || url,
            countries: this.parseCountries(title + ' ' + excerpt),
            level: this.parseLevel(title + ' ' + excerpt),
            type: this.parseType(title + ' ' + excerpt),
            languages: this.parseLanguages(title + ' ' + excerpt),
            fields: this.parseFields(title + ' ' + excerpt),
            deadline: this.parseDeadline(dateText) || this.extractDeadlineFromText(excerpt),
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
    const providers = ['Erasmus', 'UNESCO', 'DAAD', 'Fulbright', 'Commonwealth', 'Chevening', 'Mastercard', 'Gates', 'World Bank', 'Aga Khan', 'Ford Foundation', 'Rotary']
    for (const p of providers) {
      if (title.includes(p)) return p
    }
    return null
  }

  extractDeadlineFromText(text) {
    if (!text) return null
    const match = text.match(/deadline[:\s]+([A-Za-z]+ \d{1,2},?\s*\d{4})/i) ||
      text.match(/closes?\s+(?:on\s+)?([A-Za-z]+ \d{1,2},?\s*\d{4})/i) ||
      text.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
    return match ? this.parseDeadline(match[1]) : null
  }
}

module.exports = Scholars4DevScraper