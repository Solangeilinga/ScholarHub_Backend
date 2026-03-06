const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const chat = async (req, res) => {
  try {
    const { messages, userProfile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages requis' });
    }

    const systemPrompt = `Tu es ScholarBot, l'assistant IA de ScholarHub, une plateforme qui centralise les bourses d'études destinées aux étudiants africains.

IMPORTANT - Langue : Ne demande jamais à l'utilisateur quelle langue il préfère. Réponds directement dans la langue du dernier message utilisateur. Si la langue n'est pas claire, utilise le français par défaut.

Tu aides les étudiants africains à :
- Trouver des bourses internationales qui ciblent spécifiquement les étudiants africains (bourses françaises, américaines, canadiennes, chinoises, européennes, etc.)
- Comprendre les critères d'éligibilité selon leur pays d'origine
- Préparer leurs dossiers de candidature
- Rédiger des lettres de motivation et statements of purpose
- Conseiller sur les délais et procédures de chaque bourse
- Expliquer les différents types (Master, PhD, formation courte, gouvernementales, privées)
- Orienter vers des bourses comme : Eiffel, Mastercard Foundation, Mo Ibrahim, DAAD, Campus France, Fulbright, Commonwealth, Erasmus+, bourses chinoises CSC, etc.

Profil de l'utilisateur :
${userProfile ? JSON.stringify(userProfile, null, 2) : 'Non connecté'}

Règles :
- Sois encourageant et bienveillant
- Donne des conseils pratiques adaptés au contexte africain
- Tiens compte du pays d'origine pour personnaliser tes réponses
- N'invente jamais de montants ou dates que tu ne connais pas avec certitude
- Reste cohérent avec la langue utilisée par l'utilisateur dans ses messages`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    });

    res.json({
      message: response.choices[0].message.content,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Erreur du chatbot' });
  }
};

module.exports = { chat };
