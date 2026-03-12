const BaseScraper = require('../base-scraper')
const logger = require('../../../utils/logger')

class OpportunitesAfriqueScraper extends BaseScraper {
  constructor() {
    super('OpportunitesAfrique', 'https://www.opportunites-afrique.com')
  }

  async scrape() {
    logger.info(`[${this.name}] Début du scraping...`)
    const scholarships = []

    const urls = [
      `${this.baseUrl}/category/bourses-detudes/`,
      `${this.baseUrl}/category/bourses-detudes/page/2/`,
      `${this.baseUrl}/category/bourses-detudes/page/3/`,
    ]

    for (const url of urls) {
      const $ = await this.fetchPage(url)
      if (!$) continue

      const articles = $('article').toArray()

      for (const article of articles) {
        try {
          const el = $(article)
          const title = el.find('h2 a, h3 a, .entry-title a').first().text().trim()
          const link = el.find('h2 a, h3 a, .entry-title a').first().attr('href')
          const excerpt = el.find('.entry-summary, .excerpt, p').first().text().trim()
          const dateText = el.find('time, .entry-date, .post-date').first().text().trim()

          if (!title || !link) continue
          if (title.length < 10) continue

          const detail = await this.scrapeDetail(link)
          const combinedText = title + ' ' + excerpt

          scholarships.push({
            title: title.substring(0, 200),
            description: detail?.description || excerpt || title,
            provider: detail?.provider || this.extractProvider(title),
            link,
            countries: this.parseCountries(combinedText),
            level: this.parseLevel(combinedText),
            type: this.parseType(combinedText),
            languages: this.parseLanguages(combinedText),  // ← était extractLanguages
            fields: this.parseFields(combinedText),         // ← nouveau
            deadline: detail?.deadline || this.parseDeadline(dateText),
            benefits: detail?.benefits || [],
            requirements: detail?.requirements || null,
            source: url,
          })

          await new Promise(r => setTimeout(r, 1000))
        } catch (e) {
          logger.warn(`[${this.name}] Erreur article: ${e.message}`)
        }
      }
    }

    logger.info(`[${this.name}] ${scholarships.length} bourses collectées`)
    return scholarships
  }

  async scrapeDetail(url) {
    const $ = await this.fetchPage(url)
    if (!$) return null

    const content = $('.entry-content, .post-content, article').first().text()

    const deadlineMatch = content.match(/date limite[^:]*:?\s*([^\n\.]+)/i) ||
      content.match(/deadline[^:]*:?\s*([^\n\.]+)/i) ||
      content.match(/candidature[^:]*avant[^:]*:?\s*([^\n\.]+)/i)

    const providerMatch = content.match(/organisme[^:]*:?\s*([^\n\.]+)/i) ||
      content.match(/financé[e]? par[^:]*:?\s*([^\n\.]+)/i) ||
      content.match(/offert[e]? par[^:]*:?\s*([^\n\.]+)/i)

    const benefits = []
    $('ul li, ol li').each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 10 && text.length < 200) benefits.push(text)
    })

    return {
      description: content.substring(0, 1000).trim(),
      deadline: deadlineMatch ? this.parseDeadline(deadlineMatch[1]) : null,
      provider: providerMatch ? providerMatch[1].trim().substring(0, 100) : null,
      benefits: benefits.slice(0, 8),
      requirements: null,
    }
  }

  extractProvider(title) {
    const providers = ['Erasmus', 'Campus France', 'OIF', 'UNESCO', 'ONU', 'Union Africaine', 'Banque Mondiale', 'AFD', 'DAAD', 'Fulbright', 'Commonwealth']
    for (const p of providers) {
      if (title.includes(p)) return p
    }
    return 'Opportunités Afrique'
  }
}

module.exports = OpportunitesAfriqueScraper