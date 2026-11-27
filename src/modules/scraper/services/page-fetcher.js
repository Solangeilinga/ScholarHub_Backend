const axios = require('axios')
const cheerio = require('cheerio')
const dns = require('dns').promises
const http = require('http')
const https = require('https')
const net = require('net')
const logger = require('../../../utils/logger')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

const MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const ALLOWED_PORTS = new Set(['', '80', '443'])

// Balises qui ne contiennent jamais d'information utile sur une bourse
const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header', 'noscript',
  'iframe', 'form', '.menu', '.navbar', '.comments', '.related-posts',
  '.sidebar', '.cookie-banner', '.share-buttons', '.advertisement',
]

function ipv4ToNumber(address) {
  return address.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0)
}

function isPublicIPv4(address) {
  const n = ipv4ToNumber(address)
  const inRange = (base, mask) => (n & mask) === (base & mask)
  const blocked = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ]
  return !blocked.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return inRange(ipv4ToNumber(base), mask)
  })
}

function ipv6ToBigInt(address) {
  let value = address.toLowerCase().split('%')[0]
  if (value.includes('.')) return null // IPv4-mapped/embedded forms are rejected.
  const halves = value.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(missing).fill('0'), ...right]
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return groups.reduce((result, part) => (result << 16n) | BigInt(parseInt(part, 16)), 0n)
}

function isPublicIPv6(address) {
  const value = ipv6ToBigInt(address)
  if (value === null) return false
  const prefix = (bits) => value >> BigInt(128 - bits)
  // Autorise uniquement l'espace global unicast 2000::/3.
  if (prefix(3) !== 1n) return false
  // Exclut documentation, Teredo, 6to4 et les plages réservées spéciales.
  if (prefix(32) === 0x20010db8n) return false
  if (prefix(32) === 0x20010000n) return false
  if (prefix(16) === 0x2002n) return false
  return true
}

function isPublicAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return isPublicIPv4(address)
  if (family === 6) return isPublicIPv6(address)
  return false
}

async function validateAndResolveUrl(input) {
  let parsed
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('URL invalide')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocole non autorisé')
  if (parsed.username || parsed.password) throw new Error('Identifiants dans URL interdits')
  if (!ALLOWED_PORTS.has(parsed.port)) throw new Error('Port réseau non autorisé')

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Hôte local interdit')
  }

  let addresses
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }]
  } else {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  }

  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Adresse IP privée ou réservée interdite')
  }

  // On épingle la connexion à une adresse vérifiée pour limiter le DNS rebinding.
  return {
    url: parsed,
    address: addresses[0].address,
    family: addresses[0].family,
  }
}

function createPinnedAgent(protocol, address, family) {
  const lookup = (_hostname, options, callback) => {
    const result = { address, family }
    if (options && options.all) return callback(null, [result])
    return callback(null, address, family)
  }
  const Agent = protocol === 'https:' ? https.Agent : http.Agent
  return new Agent({ keepAlive: false, lookup })
}

async function requestPage(initialUrl) {
  let currentUrl = initialUrl

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const validated = await validateAndResolveUrl(currentUrl)
    const agent = createPinnedAgent(validated.url.protocol, validated.address, validated.family)
    let response

    try {
      response = await axios.get(validated.url.toString(), {
        timeout: 20000,
        maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        responseType: 'text',
        responseEncoding: 'utf8',
        httpAgent: validated.url.protocol === 'http:' ? agent : undefined,
        httpsAgent: validated.url.protocol === 'https:' ? agent : undefined,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
        validateStatus: (status) => (status >= 200 && status < 300) || [301, 302, 303, 307, 308].includes(status),
      })
    } finally {
      agent.destroy()
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location
      if (!location) throw new Error('Redirection sans destination')
      if (redirects === MAX_REDIRECTS) throw new Error('Trop de redirections')
      currentUrl = new URL(location, validated.url).toString()
      continue
    }

    const contentType = String(response.headers['content-type'] || '').toLowerCase()
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      throw new Error('Type de contenu non autorisé')
    }
    return response.data
  }

  throw new Error('Trop de redirections')
}

/**
 * Récupère une page et retourne un texte propre exploitable par un LLM.
 * Chaque URL et chaque redirection sont contrôlées avant la connexion.
 */
async function fetchCleanText(url, { maxChars = 12000 } = {}) {
  try {
    const data = await requestPage(url)
    const $ = cheerio.load(data)
    NOISE_SELECTORS.forEach((sel) => $(sel).remove())

    const pageTitle = $('title').first().text().trim()
    const h1 = $('h1').first().text().trim()

    const mainSelectors = ['article', 'main', '.entry-content', '.post-content', '.content', 'body']
    let text = ''
    for (const sel of mainSelectors) {
      const t = $(sel).first().text().replace(/\s+/g, ' ').trim()
      if (t.length > 200) {
        text = t
        break
      }
    }
    if (!text) text = $('body').text().replace(/\s+/g, ' ').trim()

    const fullText = `${h1 || pageTitle}\n\n${text}`.slice(0, maxChars)
    return { title: h1 || pageTitle, text: fullText, html$: $ }
  } catch (e) {
    logger.warn(`[page-fetcher] Échec fetch sécurisé ${url}: ${e.message}`)
    return null
  }
}

module.exports = { fetchCleanText }
