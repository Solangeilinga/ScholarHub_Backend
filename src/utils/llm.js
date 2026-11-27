const OpenAI = require('openai')
const logger = require('./logger')

// Groq et Gemini exposent tous les deux une API compatible OpenAI, donc on
// réutilise le même client, juste avec une baseURL différente. Ordre d'essai :
// Groq (gratuit, rapide) → Gemini (gratuit, secours si Groq échoue).
// Module partagé entre l'extracteur IA du scraping et le chatbot ScholarBot.
const PROVIDERS = [
  process.env.GROQ_API_KEY && {
    name: 'Groq (Llama 3.3 70B)',
    model: 'llama-3.3-70b-versatile',
    client: new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }),
  },
  process.env.GEMINI_API_KEY && {
    name: 'Gemini 2.5 Flash',
    model: 'gemini-2.5-flash',
    client: new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    }),
  },
].filter(Boolean)

if (PROVIDERS.length === 0) {
  logger.warn('[llm] Aucune clé IA configurée (GROQ_API_KEY / GEMINI_API_KEY) — fonctionnalités IA désactivées')
}

/**
 * Extrait le premier bloc JSON valide d'une réponse — au cas où un modèle
 * ignore la consigne "JSON pur" et entoure sa réponse de texte/```json.
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
 * Extrait un délai d'attente suggéré depuis un message d'erreur de rate-limit
 * Groq (ex: "Please try again in 4.535s"), sinon retourne un délai par défaut.
 */
function extractRetryDelayMs(message, fallbackMs) {
  const match = /try again in ([\d.]+)s/i.exec(message || '')
  return match ? Math.ceil(parseFloat(match[1]) * 1000) + 300 : fallbackMs
}

function isRateLimitError(e) {
  return e?.status === 429 || /rate limit/i.test(e?.message || '')
}

/**
 * Appel simple (une seule réponse, pas de tool-calling), avec fallback
 * automatique d'un provider à l'autre en cas d'échec.
 * Sur une erreur 429 (rate limit), on réessaie d'abord le MÊME provider après
 * un court délai (c'est transitoire), avant de passer au suivant.
 */
async function completeWithFallback({ messages, jsonMode = false, maxTokens = 1200 }) {
  let lastError
  for (const provider of PROVIDERS) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          max_tokens: maxTokens,
          temperature: 0,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages,
        })
        const content = response.choices[0].message.content
        return jsonMode ? parseJsonLoose(content) : content
      } catch (e) {
        lastError = e
        if (attempt === 0 && isRateLimitError(e)) {
          const delay = extractRetryDelayMs(e.message, 3000)
          logger.warn(`[llm] ${provider.name} rate-limited, nouvel essai dans ${delay}ms...`)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        logger.warn(`[llm] ${provider.name} a échoué (${e.message}), essai du provider suivant...`)
        break
      }
    }
  }
  throw lastError || new Error('Aucun provider IA configuré')
}

/**
 * Boucle de conversation avec tool-calling : le modèle peut demander
 * l'exécution d'une ou plusieurs fonctions (recherche de bourses, bourses
 * sauvegardées, candidatures...) avant de donner sa réponse finale.
 * `executeTool(name, args)` doit retourner une chaîne (le résultat, en JSON de préférence).
 */
async function chatWithTools({ messages, tools, executeTool, maxTokens = 800, maxRounds = 3, maxToolCalls = 3 }) {
  let lastError
  for (const provider of PROVIDERS) {
    try {
      let convo = [...messages]
      for (let round = 0; round < maxRounds; round++) {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: convo,
          tools,
        })
        const msg = response.choices[0].message
        const toolCalls = msg.tool_calls

        if (!toolCalls || toolCalls.length === 0) {
          return msg.content
        }

        convo.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls })
        for (const call of toolCalls.slice(0, maxToolCalls)) {
          let result
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
            result = await executeTool(call.function.name, args)
          } catch (e) {
            result = JSON.stringify({ error: e.message })
          }
          const toolContent = typeof result === 'string' ? result : JSON.stringify(result)
          convo.push({ role: 'tool', tool_call_id: call.id, content: String(toolContent).slice(0, 8000) })
        }
      }
      // Trop de tours d'outils sans réponse finale — on redemande une synthèse sans outils
      const fallbackResponse = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: maxTokens,
        messages: [...convo, { role: 'user', content: 'Donne ta réponse finale maintenant, en texte simple.' }],
      })
      return fallbackResponse.choices[0].message.content
    } catch (e) {
      lastError = e
      logger.warn(`[llm] ${provider.name} a échoué en tool-calling (${e.message}), essai du provider suivant...`)
    }
  }
  throw lastError || new Error('Aucun provider IA configuré')
}

module.exports = { completeWithFallback, chatWithTools, hasProvider: PROVIDERS.length > 0 }
