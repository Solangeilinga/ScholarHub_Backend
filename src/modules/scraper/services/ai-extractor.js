const OpenAI = require('openai')
const logger = require('../../../utils/logger')

// Groq et Gemini exposent tous les deux une API compatible OpenAI, donc on
// réutilise le même client, juste avec une baseURL différente. Ordre d'essai :
// Groq (gratuit, rapide) → Gemini (gratuit, fallback si Groq est en rate-limit
// ou en panne) → aucun (extraction désactivée si aucune clé n'est configurée).
const PROVIDERS = [
  process.env.GROQ_API_KEY && {
    name: 'Groq (Llama 3.3 70B)',
    model: 'llama-3.3-70b-versatile',
    client: new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }),
  },
  process.env.GEMINI_API_KEY && {
    name: 'Gemini 2.0 Flash',
    model: 'gemini-2.0-flash',
    client: new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    }),
  },
].filter(Boolean)

if (PROVIDERS.length === 0) {
  logger.warn('[ai-extractor] Aucune clé IA configurée (GROQ_API_KEY / GEMINI_API_KEY) — extraction désactivée')
}

const VALID_LEVELS = [
  'BEPC', 'BACCALAUREAT', 'LICENCE_1', 'LICENCE_2', 'LICENCE_3', 'LICENCE',
  'MAITRISE', 'MASTER_1', 'MASTER_2', 'MASTER', 'DOCTORAT_1', 'DOCTORAT_2', 'DOCTORAT',
]
const VALID_TYPES = ['COMPLETE', 'PARTIELLE', 'RECHERCHE', 'FORMATION']

const SYSTEM_PROMPT = `Tu es un extracteur de données structurées spécialisé dans les bourses d'études pour étudiants africains.

On te donne le texte brut d'une page web (annonce de bourse, article de blog, page institutionnelle).
Ta mission : déterminer si cette page décrit UNE bourse d'études réelle et précise, et si oui, en extraire les informations avec exactitude.

Règles strictes :
- N'invente JAMAIS une information qui n'est pas explicitement présente ou clairement déductible du texte. Si une donnée est absente, mets null (ou tableau vide pour les listes).
- Ne mets JAMAIS un pays, un niveau d'étude ou une deadline "par défaut" si ce n'est pas dans le texte. L'absence d'info doit rester une absence, pas une supposition.
- "countries" = liste de codes pays ISO 3166-1 alpha-2 des pays dont les étudiants sont éligibles. Si le texte dit "tous pays" ou "tous pays africains", retourne exactement ["ALL_AFRICA"]. Si le texte ne précise aucune restriction géographique claire, retourne [] plutôt que de deviner.
- "deadline" = date ISO 8601 (YYYY-MM-DD) si trouvable et non déjà passée, sinon null.
- "level" = sous-liste parmi: ${VALID_LEVELS.join(', ')}. Vide si non précisé.
- "type" = une valeur parmi: ${VALID_TYPES.join(', ')}. Par défaut "COMPLETE" seulement si le texte décrit clairement une bourse complète.
- "amount" = montant numérique si un chiffre précis est donné (sinon null), "currency" = devise ISO (USD, EUR...) si trouvée.
- "confidence" = ton propre niveau de confiance de 0 à 1 sur la qualité globale de l'extraction (0 = quasi rien de fiable, 1 = toutes les infos clés sont explicites et sourcées dans le texte).
- "isScholarship" = false si la page ne décrit pas une bourse d'études précise (ex: page d'accueil, liste d'articles, page générique, offre d'emploi, actualité non liée).
- "issues" = liste courte de chaînes signalant ce qui est incertain, ambigu ou manquant (utile pour la revue humaine).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact suivant :
{
  "isScholarship": boolean,
  "title": string|null,
  "provider": string|null,
  "description": string|null,
  "countries": string[],
  "level": string[],
  "type": string,
  "languages": string[],
  "fields": string[],
  "amount": number|null,
  "currency": string|null,
  "deadline": string|null,
  "benefits": string[],
  "requirements": string|null,
  "confidence": number,
  "issues": string[]
}`

/**
 * Extrait le premier bloc JSON valide d'une réponse — au cas où un modèle
 * (surtout les open-source via Groq) ignore la consigne "JSON pur" et entoure
 * sa réponse de ```json ... ``` ou de texte explicatif.
 */
function parseJsonLoose(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Réponse IA non parsable en JSON')
  }
}

/**
 * Appelle les providers IA disponibles dans l'ordre (Groq puis Gemini),
 * et bascule sur le suivant si l'un échoue (rate-limit, panne, etc.).
 */
async function callWithFallback(messages) {
  let lastError
  for (const provider of PROVIDERS) {
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: 1200,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages,
      })
      return parseJsonLoose(response.choices[0].message.content)
    } catch (e) {
      lastError = e
      logger.warn(`[ai-extractor] ${provider.name} a échoué (${e.message}), essai du provider suivant...`)
    }
  }
  throw lastError || new Error('Aucun provider IA configuré')
}

/**
 * Envoie le texte nettoyé d'une page à un LLM pour en extraire une bourse
 * structurée, avec un score de confiance explicite.
 * Retourne null si l'IA juge que ce n'est pas une bourse exploitable.
 */
async function extractScholarship({ url, pageTitle, text }) {
  if (!text || text.length < 200 || PROVIDERS.length === 0) return null

  try {
    const parsed = await callWithFallback([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `URL source: ${url}\nTitre de page: ${pageTitle || 'inconnu'}\n\nTexte de la page :\n"""\n${text}\n"""`,
      },
    ])

    if (!parsed.isScholarship) return null

    // Validation / nettoyage défensif — on ne fait jamais confiance aveuglément au LLM
    const level = Array.isArray(parsed.level)
      ? parsed.level.filter((l) => VALID_LEVELS.includes(l))
      : []
    const type = VALID_TYPES.includes(parsed.type) ? parsed.type : 'COMPLETE'
    const deadline = parsed.deadline ? new Date(parsed.deadline) : null
    const validDeadline = deadline && !isNaN(deadline.getTime()) && deadline > new Date() ? deadline : null
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.3

    if (!parsed.title || parsed.title.length < 5) return null

    return {
      title: parsed.title.slice(0, 200),
      description: parsed.description || parsed.title,
      provider: parsed.provider || 'Source inconnue',
      countries: Array.isArray(parsed.countries) ? parsed.countries : [],
      level,
      type,
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      currency: parsed.currency || null,
      deadline: validDeadline,
      benefits: Array.isArray(parsed.benefits) ? parsed.benefits : [],
      requirements: parsed.requirements || null,
      confidenceScore: confidence,
      extractionNotes: Array.isArray(parsed.issues) && parsed.issues.length
        ? parsed.issues.join('; ').slice(0, 500)
        : null,
      rawExcerpt: text.slice(0, 800),
    }
  } catch (e) {
    logger.warn(`[ai-extractor] Échec extraction ${url}: ${e.message}`)
    return null
  }
}

module.exports = { extractScholarship }