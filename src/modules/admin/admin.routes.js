const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/db');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');
const { AppError } = require('../../middlewares/error.middleware');
const { sendEmail } = require('../../utils/mailer');
const authService = require('../auth/auth.service');

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

module.exports = router;