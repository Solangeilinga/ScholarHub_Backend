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
    await prisma.user.delete({ where: { id: req.user.id } });
    res.json({ message: 'Compte supprimé' });
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
    const { fcmToken } = req.body;
    await prisma.user.update({ where: { id: req.user.id }, data: { fcmToken } });
    res.json({ message: 'Token FCM mis à jour' });
  } catch (error) { next(error); }
};

module.exports = { getProfile, updateProfile, changePassword, deleteAccount, getSaved, getApplications, updateFcmToken };
