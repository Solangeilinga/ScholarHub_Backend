const prisma = require('../../config/db');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const { AppError } = require('../../middlewares/error.middleware');

const getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, country: true, nationality: true,
        level: true, fields: true, languages: true, bio: true, avatarUrl: true,
        role: true, isVerified: true, notificationsEnabled: true, createdAt: true,
        _count: { select: { savedScholarships: true, applications: true } },
      },
    });
    res.json({ user });
  } catch (error) { next(error); }
};

const updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, country, nationality, level, fields, languages, bio, notificationsEnabled } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, country, nationality, level, fields, languages, bio, notificationsEnabled },
      select: { id: true, name: true, email: true, country: true, level: true, fields: true },
    });
    res.json({ message: 'Profil mis à jour', user });
  } catch (error) { next(error); }
};

const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    if (currentPassword === newPassword) {
      throw new AppError('Le nouveau mot de passe doit être différent de l’ancien', 400);
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new AppError('Mot de passe actuel incorrect', 400);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    res.json({ message: 'Mot de passe modifié. Veuillez vous reconnecter sur vos appareils.' });
  } catch (error) { next(error); }
};

const deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (typeof password !== 'string' || !password) {
      throw new AppError('Votre mot de passe est requis pour confirmer la suppression', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError('Mot de passe incorrect', 401);
    }

    // Les relations utilisateur sont configurées avec onDelete: Cascade.
    // La suppression du compte supprime donc aussi les données qui lui appartiennent.
    await prisma.user.delete({ where: { id: user.id } });
    res.json({ message: 'Compte et données personnelles associées supprimés' });
  } catch (error) { next(error); }
};

const exportPersonalData = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [user, saved, applications, notifications, supportTickets, chatMessages] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, name: true, email: true, country: true, nationality: true,
          level: true, fields: true, languages: true, bio: true, avatarUrl: true,
          role: true, isVerified: true, notificationsEnabled: true, createdAt: true,
        },
      }),
      prisma.savedScholarship.findMany({
        where: { userId },
        select: { savedAt: true, scholarship: { select: { id: true, title: true, provider: true, deadline: true, link: true } } },
      }),
      prisma.application.findMany({
        where: { userId },
        select: { status: true, notes: true, appliedAt: true, createdAt: true, updatedAt: true,
          scholarship: { select: { id: true, title: true, provider: true, deadline: true, link: true } } },
      }),
      prisma.notification.findMany({
        where: { userId },
        select: { title: true, body: true, type: true, data: true, isRead: true, createdAt: true },
      }),
      prisma.supportTicket.findMany({
        where: { userId },
        select: { subject: true, message: true, reply: true, status: true, createdAt: true, updatedAt: true },
      }),
      prisma.chatMessage.findMany({
        where: { userId },
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.setHeader('Content-Disposition', 'attachment; filename="scholarhub-personal-data.json"');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      exportedAt: new Date().toISOString(),
      profile: user,
      savedScholarships: saved,
      applications,
      notifications,
      supportTickets,
      chatHistory: chatMessages,
    });
  } catch (error) { next(error); }
};

const getSaved = async (req, res, next) => {
  try {
    const saved = await prisma.savedScholarship.findMany({
      where: { userId: req.user.id },
      include: { scholarship: true },
      orderBy: { savedAt: 'desc' },
    });
    res.json({ saved: saved.map((s) => s.scholarship) });
  } catch (error) { next(error); }
};

const getApplications = async (req, res, next) => {
  try {
    const applications = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: { scholarship: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ applications });
  } catch (error) { next(error); }
};

const updateFcmToken = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { fcmToken } = req.body;
    await prisma.user.update({ where: { id: req.user.id }, data: { fcmToken } });
    res.json({ message: 'Token FCM mis à jour' });
  } catch (error) { next(error); }
};

module.exports = { getProfile, updateProfile, changePassword, deleteAccount, exportPersonalData, getSaved, getApplications, updateFcmToken };
