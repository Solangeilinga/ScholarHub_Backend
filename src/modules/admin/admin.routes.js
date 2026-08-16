const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/db');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');
const { AppError } = require('../../middlewares/error.middleware');
const { sendEmail } = require('../../utils/mailer');
const authService = require('../auth/auth.service');
const { fetchCleanText } = require('../scraper/services/page-fetcher');
const { extractScholarship } = require('../scraper/services/ai-extractor');
const { ALL_AFRICAN_COUNTRY_CODES } = require('../scraper/services/constants');
const { hasProvider } = require('../../utils/llm');

router.use(authenticate, requireAdmin);

router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalScholarships, activeScholarships, totalApplications] = await Promise.all([
      prisma.user.count(),
      prisma.scholarship.count(),
      prisma.scholarship.count({ where: { isActive: true, deadline: { gte: new Date() } } }),
      prisma.application.count(),
    ]);
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, country: true, createdAt: true },
    });
    res.json({ stats: { totalUsers, totalScholarships, activeScholarships, totalApplications }, recentUsers });
  } catch (error) { next(error); }
});

router.get('/scholarships', async (req, res, next) => {
  try {
    const { page = 1, limit = 100, search } = req.query;
    const skip = (page - 1) * parseInt(limit);
    const where = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { provider: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [scholarships, total] = await Promise.all([
      prisma.scholarship.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scholarship.count({ where }),
    ]);
    res.json({
      scholarships,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) { next(error); }
});

// Créer un nouvel utilisateur admin directement depuis le panel
// (compte immédiatement vérifié et actif, pas besoin de passer par l'inscription publique)
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role = 'ADMIN' } = req.body;

    if (!name || !email || !password) {
      throw new AppError('Nom, email et mot de passe sont requis', 400);
    }
    if (password.length < 8) {
      throw new AppError('Le mot de passe doit contenir au moins 8 caractères', 400);
    }
    if (!['USER', 'ADMIN'].includes(role)) {
      throw new AppError('Rôle invalide', 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new AppError('Un compte avec cet email existe déjà', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
        isVerified: true, // créé par un admin -> pas de vérification email nécessaire
        verificationToken: uuidv4(),
      },
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    });

    await sendEmail({
      to: user.email,
      subject: 'Votre compte administrateur ScholarHub',
      html: `
        <h2>Bienvenue sur ScholarHub, ${name} !</h2>
        <p>Un compte ${role === 'ADMIN' ? 'administrateur' : 'utilisateur'} vient d'être créé pour vous sur le panel ScholarHub.</p>
        <p><strong>Email :</strong> ${user.email}<br/>
        <strong>Mot de passe :</strong> celui qui vous a été communiqué par la personne qui a créé ce compte.</p>
        <p>Nous vous recommandons de changer ce mot de passe dès votre première connexion.</p>
      `,
    });

    res.status(201).json({ message: 'Compte créé avec succès', user });
  } catch (error) { next(error); }
});

router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, country: true, role: true, isVerified: true, createdAt: true },
      }),
      prisma.user.count(),
    ]);
    res.json({ users, pagination: { page: parseInt(page), total, totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) { next(error); }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!['USER', 'ADMIN'].includes(role)) {
      throw new AppError('Rôle invalide', 400);
    }

    // Un admin ne peut pas se rétrograder lui-même (évite de se retrouver bloqué hors du panel)
    if (req.params.id === req.user.id && role !== 'ADMIN') {
      throw new AppError('Vous ne pouvez pas retirer votre propre statut administrateur', 400);
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('Utilisateur introuvable', 404);

    // Empêcher de retirer le rôle admin au dernier administrateur restant
    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new AppError('Impossible de retirer le dernier administrateur', 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json({ user });
  } catch (error) { next(error); }
});

// Envoyer un lien de réinitialisation de mot de passe à un utilisateur
// (utile pour le support quand un utilisateur est bloqué)
router.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('Utilisateur introuvable', 404);

    await authService.forgotPassword(target.email);
    res.json({ message: `Lien de réinitialisation envoyé à ${target.email}` });
  } catch (error) { next(error); }
});

// Supprimer un compte (utilisateur ou admin) depuis le panel
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      throw new AppError('Vous ne pouvez pas supprimer votre propre compte depuis le panel', 400);
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError('Utilisateur introuvable', 404);

    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new AppError('Impossible de supprimer le dernier administrateur', 400);
      }
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Compte supprimé' });
  } catch (error) { next(error); }
});

// Pré-remplit le formulaire de création de bourse à partir d'un lien ou d'un
// texte collé, en réutilisant le même pipeline IA que le scraper automatique.
router.post('/scholarships/ai-extract', async (req, res, next) => {
  try {
    if (!hasProvider) {
      throw new AppError("Aucun fournisseur IA n'est configuré côté serveur (GROQ_API_KEY / GEMINI_API_KEY).", 503);
    }

    const { url, rawText } = req.body;
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    const cleanRawText = typeof rawText === 'string' ? rawText.trim() : '';

    if (!cleanUrl && !cleanRawText) {
      throw new AppError('Fournis un lien ou colle le texte de la bourse à analyser.', 400);
    }

    let text, pageTitle;

    if (cleanRawText) {
      if (cleanRawText.length < 150) {
        throw new AppError('Le texte collé est trop court pour être analysé (150 caractères minimum).', 400);
      }
      text = cleanRawText.slice(0, 12000);
      pageTitle = null;
    } else {
      const fetched = await fetchCleanText(cleanUrl);
      if (!fetched) {
        throw new AppError('Impossible de récupérer cette page (site inaccessible, bloqué, ou lien invalide).', 422);
      }
      text = fetched.text;
      pageTitle = fetched.title;
    }

    const extracted = await extractScholarship({
      url: cleanUrl || 'texte collé manuellement par un administrateur',
      pageTitle,
      text,
    });

    if (!extracted) {
      throw new AppError("L'IA n'a pas réussi à identifier une bourse d'études exploitable dans ce contenu. Vérifie le lien/texte, ou remplis le formulaire manuellement.", 422);
    }

    // "ALL_AFRICA" est un raccourci interne au pipeline IA — on l'étend en
    // vraie liste de codes pays pour que le formulaire coche directement
    // les bonnes cases, sans que le frontend ait besoin de connaître ce sentinel.
    const countries = extracted.countries.includes('ALL_AFRICA')
      ? ALL_AFRICAN_COUNTRY_CODES
      : extracted.countries;

    res.json({
      scholarship: {
        title: extracted.title,
        provider: extracted.provider,
        description: extracted.description,
        requirements: extracted.requirements || '',
        benefits: Array.isArray(extracted.benefits) ? extracted.benefits.join('\n') : '',
        link: cleanUrl || '',
        amount: extracted.amount,
        currency: extracted.currency,
        deadline: extracted.deadline,
        type: extracted.type,
        typeDetails: extracted.typeDetails,
        level: extracted.level,
        countries,
        fields: extracted.fields,
        languages: extracted.languages,
      },
      confidenceScore: extracted.confidenceScore,
      issues: extracted.extractionNotes,
    });
  } catch (error) { next(error); }
});

module.exports = router;