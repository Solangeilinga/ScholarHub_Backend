const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { sendEmail } = require('../../utils/mailer');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
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

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      country,
      verificationToken,
    },
    select: { id: true, name: true, email: true, country: true, role: true, createdAt: true },
  });

  // Send verification email
  await sendEmail({
    to: email,
    subject: 'Bienvenue sur ScholarHub - Vérifiez votre email',
    html: `
      <h2>Bienvenue sur ScholarHub, ${name} !</h2>
      <p>Merci de rejoindre la plateforme de bourses pour étudiants africains.</p>
      <p>Cliquez sur le lien ci-dessous pour vérifier votre email :</p>
      <a href="${process.env.FRONTEND_URL}/verify-email/${verificationToken}" style="background:#6C63FF;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
        Vérifier mon email
      </a>
    `,
  });

  const token = generateToken(user.id);
  return { user, token };
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

  const { passwordHash, verificationToken, resetPasswordToken, ...userSafe } = user;
  const token = generateToken(user.id);

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
  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: resetToken },
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
  const user = await prisma.user.findFirst({ where: { resetPasswordToken: token } });
  if (!user) throw new AppError('Token invalide ou expiré', 400);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetPasswordToken: null },
  });
};

const verifyEmail = async (token) => {
  const user = await prisma.user.findFirst({ where: { verificationToken: token } });
  if (!user) throw new AppError('Token de vérification invalide', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, verificationToken: null },
  });
};

const refreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = generateToken(decoded.userId);
    return { token: newToken };
  } catch {
    throw new AppError('Token invalide', 401);
  }
};

module.exports = { register, login, getMe, forgotPassword, resetPassword, verifyEmail, refreshToken };
