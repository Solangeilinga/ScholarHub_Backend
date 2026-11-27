const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { sendEmail } = require('../../utils/mailer');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]);


const hashOneTimeToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ userId, ver: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const register = async ({ name, email, password, country }) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('Un compte avec cet email existe déjà', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = uuidv4();
  const verificationTokenHash = hashOneTimeToken(verificationToken);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      country,
      verificationToken: verificationTokenHash,
    },
    select: { id: true, name: true, email: true, country: true, role: true, tokenVersion: true, createdAt: true },
  });

  // Send verification email
  await sendEmail({
    to: email,
    subject: 'Bienvenue sur ScholarHub - Vérifiez votre email',
    html: `
      <h2>Bienvenue sur ScholarHub, ${escapeHtml(name)} !</h2>
      <p>Merci de rejoindre la plateforme de bourses pour étudiants africains.</p>
      <p>Cliquez sur le lien ci-dessous pour vérifier votre email :</p>
      <a href="${process.env.FRONTEND_URL}/verify-email/${verificationToken}" style="background:#6C63FF;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
        Vérifier mon email
      </a>
    `,
  });

  const token = generateToken(user.id, user.tokenVersion);
  const { tokenVersion, ...userSafe } = user;
  return { user: userSafe, token };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('Email ou mot de passe incorrect', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Email ou mot de passe incorrect', 401);
  }

  const { passwordHash, verificationToken, resetPasswordToken, resetPasswordTokenExpiresAt, tokenVersion, fcmToken, ...userSafe } = user;
  const token = generateToken(user.id, user.tokenVersion);

  return { user: userSafe, token };
};

const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, country: true, nationality: true,
      level: true, fields: true, languages: true, bio: true, avatarUrl: true,
      role: true, isVerified: true, notificationsEnabled: true, createdAt: true,
      _count: { select: { savedScholarships: true, applications: true } },
    },
  });
  if (!user) throw new AppError('Utilisateur non trouvé', 404);
  return user;
};

const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent fail for security

  const resetToken = uuidv4();
  const resetPasswordTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: hashOneTimeToken(resetToken), resetPasswordTokenExpiresAt },
  });

  await sendEmail({
    to: email,
    subject: 'ScholarHub - Réinitialisation du mot de passe',
    html: `
      <h2>Réinitialisation du mot de passe</h2>
      <p>Cliquez sur le lien suivant pour réinitialiser votre mot de passe :</p>
      <a href="${process.env.FRONTEND_URL}/reset-password/${resetToken}">
        Réinitialiser mon mot de passe
      </a>
      <p>Ce lien expire dans 1 heure.</p>
    `,
  });
};

const resetPassword = async (token, password) => {
  const tokenHash = hashOneTimeToken(token);
  // Accepte temporairement les anciens jetons stockés en clair pour ne pas casser
  // les liens déjà envoyés avant cette mise à jour.
  const user = await prisma.user.findFirst({
    where: { OR: [{ resetPasswordToken: tokenHash }, { resetPasswordToken: token }] },
  });
  if (!user) throw new AppError('Token invalide ou expiré', 400);

  if (!user.resetPasswordTokenExpiresAt || user.resetPasswordTokenExpiresAt < new Date()) {
    throw new AppError('Ce lien a expiré, veuillez refaire une demande', 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordTokenExpiresAt: null,
      tokenVersion: { increment: 1 },
    },
  });
};

const verifyEmail = async (token) => {
  const tokenHash = hashOneTimeToken(token);
  const user = await prisma.user.findFirst({
    where: { OR: [{ verificationToken: tokenHash }, { verificationToken: token }] },
  });
  if (!user) throw new AppError('Token de vérification invalide', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, verificationToken: null },
  });
};

const refreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, tokenVersion: true },
    });
    if (!user || (decoded.ver ?? 0) !== user.tokenVersion) {
      throw new AppError('Session expirée, veuillez vous reconnecter', 401);
    }
    const newToken = generateToken(user.id, user.tokenVersion);
    return { token: newToken };
  } catch {
    throw new AppError('Token invalide', 401);
  }
};


const logout = async (userId) => {
  // Supprimer le FCM token à la déconnexion
  await prisma.user.update({
    where: { id: userId },
    data: {
      fcmToken: null,
      tokenVersion: { increment: 1 },
    },
  });
};

module.exports = { register, login, getMe, forgotPassword, resetPassword, verifyEmail, refreshToken, logout };

