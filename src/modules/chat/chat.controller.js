const prisma = require('../../config/db')
const logger = require('../../utils/logger')
const { chatWithTools, hasProvider } = require('../../utils/llm')

// ─── Définition des outils que le bot peut appeler ──────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_scholarships',
      description: "Recherche des bourses d'études réelles et actuellement actives sur ScholarHub, filtrées par pays, niveau d'étude et/ou domaine. À utiliser dès que l'utilisateur demande des recommandations de bourses concrètes.",
      parameters: {
        type: 'object',
        properties: {
          country: { type: 'string', description: "Code pays ISO 3166-1 alpha-2 (ex: CI, SN, BF). Optionnel." },
          level: { type: 'string', description: "Niveau d'étude (ex: LICENCE, MASTER_1, DOCTORAT). Optionnel." },
          keyword: { type: 'string', description: 'Mot-clé sur le titre, le domaine ou le pays fournisseur (ex: informatique, France, ingénierie). Optionnel.' },
          limit: { type: 'number', description: 'Nombre max de résultats, défaut 5, max 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_saved_scholarships',
      description: "Retourne la liste des bourses que l'utilisateur connecté a sauvegardées sur ScholarHub.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_applications',
      description: "Retourne le suivi des candidatures de l'utilisateur connecté (statut, bourse concernée).",
      parameters: { type: 'object', properties: {} },
    },
  },
]

async function executeTool(userId, name, args) {
  if (name === 'search_scholarships') {
    const where = {
      isActive: true,
      status: 'APPROVED',
      deadline: { gte: new Date() },
    }
    if (args.country) where.countries = { has: args.country }
    if (args.level) where.level = { has: args.level }
    if (args.keyword) {
      where.OR = [
        { title: { contains: args.keyword, mode: 'insensitive' } },
        { fields: { has: args.keyword } },
        { provider: { contains: args.keyword, mode: 'insensitive' } },
      ]
    }
    const results = await prisma.scholarship.findMany({
      where,
      take: Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 10) : 5,
      orderBy: { deadline: 'asc' },
      select: { id: true, title: true, provider: true, countries: true, level: true, deadline: true, amount: true, currency: true, link: true },
    })
    return results.length
      ? results
      : { message: 'Aucune bourse active trouvée sur ScholarHub avec ces critères.' }
  }

  if (name === 'get_saved_scholarships') {
    const saved = await prisma.savedScholarship.findMany({
      where: { userId },
      include: { scholarship: { select: { id: true, title: true, provider: true, deadline: true } } },
      orderBy: { savedAt: 'desc' },
    })
    return saved.length
      ? saved.map((s) => s.scholarship)
      : { message: "L'utilisateur n'a encore sauvegardé aucune bourse." }
  }

  if (name === 'get_my_applications') {
    const apps = await prisma.application.findMany({
      where: { userId },
      include: { scholarship: { select: { title: true, provider: true, deadline: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return apps.length
      ? apps.map((a) => ({ status: a.status, scholarship: a.scholarship }))
      : { message: "L'utilisateur n'a encore aucune candidature suivie." }
  }

  return { error: `Outil inconnu: ${name}` }
}

const buildSystemPrompt = (userProfile) => `Tu es ScholarBot, l'assistant IA de ScholarHub, une plateforme qui centralise les bourses d'études destinées aux étudiants africains.

IMPORTANT - Langue : Ne demande jamais à l'utilisateur quelle langue il préfère. Réponds directement dans la langue du dernier message utilisateur. Si la langue n'est pas claire, utilise le français par défaut.

Tu as accès à des outils pour consulter les VRAIES bourses disponibles sur ScholarHub, ainsi que les bourses sauvegardées et les candidatures de l'utilisateur. UTILISE-LES dès que la question porte sur des bourses concrètes, des recommandations, ou le suivi de candidature — ne réponds JAMAIS avec des bourses inventées ou générales quand tu peux interroger la vraie base.

Tu aides les étudiants africains à :
- Trouver des bourses réelles et actives sur ScholarHub qui correspondent à leur profil (via search_scholarships)
- Faire le point sur leurs bourses sauvegardées et leurs candidatures en cours (via get_saved_scholarships / get_my_applications)
- Comprendre les critères d'éligibilité selon leur pays d'origine
- Préparer leurs dossiers de candidature
- Rédiger des lettres de motivation et statements of purpose adaptées à une bourse précise
- Conseiller sur les délais et procédures

Profil de l'utilisateur :
${userProfile ? JSON.stringify(userProfile, null, 2) : 'Non connecté'}

Règles :
- Sois encourageant et bienveillant
- Donne des conseils pratiques adaptés au contexte africain
- Tiens compte du pays d'origine pour personnaliser tes réponses
- N'invente JAMAIS de montants, deadlines ou bourses que tu n'as pas vérifiés via tes outils
- Si aucune bourse réelle ne correspond, dis-le clairement plutôt que d'en inventer une
- Reste cohérent avec la langue utilisée par l'utilisateur dans ses messages`

const deleteHistory = async (req, res, next) => {
  try {
    await prisma.chatMessage.deleteMany({ where: { userId: req.user.id } });
    res.json({ message: "Historique du chatbot supprimé" });
  } catch (error) { next(error); }
};

const chat = async (req, res) => {
  try {
    const { messages } = req.body

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
      return res.status(400).json({ error: 'La conversation doit contenir entre 1 et 30 messages' })
    }
    // Seul le dernier message utilisateur fourni par le client est accepté.
    // Les anciens messages assistant sont reconstruits depuis la base afin
    // qu'un client ne puisse pas fabriquer un faux historique ou de faux rôles.
    const lastUserMessage = messages[messages.length - 1]
    if (!lastUserMessage || lastUserMessage.role !== 'user' ||
        typeof lastUserMessage.content !== 'string' ||
        !lastUserMessage.content.trim() || lastUserMessage.content.length > 8000) {
      return res.status(400).json({ error: 'Le dernier message doit être un message utilisateur valide' })
    }
    if (!hasProvider) {
      return res.status(503).json({ error: "Le chatbot n'est pas configuré (clé IA manquante)" })
    }

    const userId = req.user.id
    const [userProfile, storedHistory] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { country: true, nationality: true, level: true, fields: true, languages: true },
      }),
      prisma.chatMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { role: true, content: true },
      }),
    ])

    const safeHistory = storedHistory
      .reverse()
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }))
    safeHistory.push({ role: 'user', content: lastUserMessage.content.trim() })

    const reply = await chatWithTools({
      messages: [
        { role: 'system', content: buildSystemPrompt(userProfile) },
        ...safeHistory,
      ],
      tools: TOOLS,
      executeTool: (name, args) => executeTool(userId, name, args),
    })

    // Historique limité aux 100 derniers messages par compte.
    await prisma.chatMessage.createMany({
      data: [
        { userId, role: 'user', content: lastUserMessage.content.trim() },
        { userId, role: 'assistant', content: String(reply).slice(0, 12000) },
      ],
    })
    const retainedMessages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true },
    })
    await prisma.chatMessage.deleteMany({
      where: { userId, id: { notIn: retainedMessages.map((message) => message.id) } },
    })

    res.json({ message: reply })
  } catch (error) {
    logger.error(`Chat error: ${error.message}`)
    res.status(500).json({ error: 'Erreur du chatbot' })
  }
}

// Historique des 50 derniers messages de l'utilisateur, pour réafficher la
// conversation quand il rouvre l'écran de chat.
const getHistory = async (req, res, next) => {
  try {
    const history = await prisma.chatMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({ messages: history.reverse() })
  } catch (error) { next(error) }
}

module.exports = { chat, getHistory, deleteHistory }
