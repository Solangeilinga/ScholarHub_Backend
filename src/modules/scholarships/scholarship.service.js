const prisma = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');

const publicScholarshipSelect = {
  id: true, title: true, description: true, provider: true, providerLogo: true,
  type: true, typeDetails: true, countries: true, fields: true, level: true,
  amount: true, currency: true, deadline: true, startDate: true, duration: true,
  link: true, requirements: true, benefits: true, languages: true,
  isActive: true, isFeatured: true, views: true, status: true,
  createdAt: true, updatedAt: true,
};

const parseBoundedInteger = (value, fallback, max, label) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(`Le paramètre ${label} est invalide.`, 400);
  }
  return Math.min(parsed, max);
};

const readFilter = (value, label, maxLength = 100) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new AppError(`Le filtre ${label} est invalide.`, 400);
  }
  return value.trim() || undefined;
};

const getAll = async (query = {}) => {
  const page = parseBoundedInteger(query.page, 1, 100000, 'page');
  const limit = parseBoundedInteger(query.limit, 10, 50, 'limit');
  const search = readFilter(query.search, 'recherche', 120);
  const country = readFilter(query.country, 'pays', 100);
  const field = readFilter(query.field, 'domaine', 100);
  const level = readFilter(query.level, 'niveau', 40);
  const type = readFilter(query.type, 'type', 30);
  const language = readFilter(query.language, 'langue', 50);
  const deadlineDays = query.deadlineDays === undefined || query.deadlineDays === ''
    ? undefined
    : parseBoundedInteger(query.deadlineDays, undefined, 365, 'délai');
  const skip = (page - 1) * limit;
  const where = { status: 'APPROVED', isActive: true };
  const conditions = [];

  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { provider: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  if (country) where.countries = { has: country };
  if (field) where.fields = { has: field };
  if (level) {
    const validLevels = [
      'BEPC', 'BACCALAUREAT', 'LICENCE_1', 'LICENCE_2', 'LICENCE_3', 'LICENCE',
      'MAITRISE', 'MASTER_1', 'MASTER_2', 'MASTER', 'DOCTORAT_1', 'DOCTORAT_2', 'DOCTORAT',
    ];
    if (!validLevels.includes(level)) throw new AppError('Le filtre niveau est invalide.', 400);
    where.level = { has: level };
  }
  if (type) {
    if (!['COMPLETE', 'PARTIELLE', 'RECHERCHE', 'FORMATION'].includes(type)) {
      throw new AppError('Le filtre type est invalide.', 400);
    }
    where.type = type;
  }
  if (language) where.languages = { has: language };

  if (deadlineDays !== undefined) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);
    where.deadline = { lte: deadline, gte: new Date() };
  } else {
    conditions.push({ OR: [{ deadline: null }, { deadline: { gte: new Date() } }] });
  }
  if (conditions.length) where.AND = conditions;

  const [scholarships, total] = await Promise.all([
    prisma.scholarship.findMany({
      where,
      select: publicScholarshipSelect,
      skip,
      take: limit,
      orderBy: [{ isFeatured: 'desc' }, { deadline: 'asc' }],
    }),
    prisma.scholarship.count({ where }),
  ]);

  return {
    scholarships,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllAdmin = async (query = {}) => {
  const page = parseBoundedInteger(query.page, 1, 100000, 'page');
  const limit = parseBoundedInteger(query.limit, 100, 100, 'limit');
  const search = readFilter(query.search, 'recherche', 120);
  const skip = (page - 1) * limit;
  const where = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { provider: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [scholarships, total] = await Promise.all([
    prisma.scholarship.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.scholarship.count({ where }),
  ]);

  return {
    scholarships,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getFeatured = async () => {
  return prisma.scholarship.findMany({
    where: { status: 'APPROVED', isActive: true, isFeatured: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] },
    select: publicScholarshipSelect,
    take: 6,
    orderBy: { deadline: 'asc' },
  });
};

const getOne = async (id) => {
  // Une bourse non publiée ou désactivée ne doit jamais être accessible au public,
  // même si son identifiant est connu.
  const scholarship = await prisma.scholarship.findFirst({
    where: { id, status: 'APPROVED', isActive: true },
    select: publicScholarshipSelect,
  });
  if (!scholarship) throw new AppError('Bourse non trouvée', 404);
  return scholarship;
};

const getRecommended = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true, level: true, fields: true, languages: true },
  });

  const scholarships = await prisma.scholarship.findMany({
    where: { status: 'APPROVED', isActive: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] },
    select: publicScholarshipSelect,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const scored = scholarships.map((s) => {
    let score = 0;
    if (user.country && s.countries.includes(user.country)) score += 40;
    if (user.level && s.level.includes(user.level)) score += 30;
    if (user.fields?.length && s.fields.some((f) => user.fields.includes(f))) score += 20;
    if (user.languages?.length && s.languages.some((l) => user.languages.includes(l))) score += 10;
    const daysLeft = s.deadline
      ? Math.ceil((new Date(s.deadline) - new Date()) / (1000 * 60 * 60 * 24))
      : null;
    if (daysLeft !== null && daysLeft > 30) score += 5;
    return { ...s, score };
  });

  const withScore = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  // ← Si profil incomplet → retourner les plus récentes quand même
  if (withScore.length < 5) {
    const ids = withScore.map((s) => s.id);
    const fallback = scored
      .filter((s) => !ids.includes(s.id))
      .sort((a, b) => b.score - a.score || (b.deadline ? new Date(b.deadline).getTime() : 0) - (a.deadline ? new Date(a.deadline).getTime() : 0));
    return [...withScore, ...fallback].slice(0, 10);
  }

  return withScore.slice(0, 10);
};

const saveScholarship = async (userId, scholarshipId) => {
  await getOne(scholarshipId);
  return prisma.savedScholarship.upsert({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    update: {},
    create: { userId, scholarshipId },
  });
};

const unsaveScholarship = async (userId, scholarshipId) => {
  await prisma.savedScholarship.deleteMany({ where: { userId, scholarshipId } });
};

const validateApplicationInput = ({ status, notes }) => {
  const allowedStatuses = ['SAVED', 'EN_COURS', 'SOUMISE', 'ACCEPTEE', 'REFUSEE'];
  if (status !== undefined && !allowedStatuses.includes(status)) {
    throw new AppError('Statut de candidature invalide', 400);
  }
  if (notes !== undefined && notes !== null &&
      (typeof notes !== 'string' || notes.length > 5000)) {
    throw new AppError('Les notes ne doivent pas dépasser 5 000 caractères', 400);
  }
};

const trackApplication = async (userId, scholarshipId, input = {}) => {
  const { status, notes } = input;
  validateApplicationInput({ status, notes });
  await getOne(scholarshipId);
  const safeData = {};
  if (status !== undefined) safeData.status = status;
  if (notes !== undefined) safeData.notes = notes;
  return prisma.application.upsert({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    update: safeData,
    create: { userId, scholarshipId, status: status || 'SAVED', notes: notes ?? null },
    select: {
      id: true, scholarshipId: true, status: true, notes: true,
      appliedAt: true, createdAt: true, updatedAt: true,
    },
  });
};

const updateApplication = async (userId, scholarshipId, input = {}) => {
  const { status, notes } = input;
  validateApplicationInput({ status, notes });
  if (status === undefined && notes === undefined) {
    throw new AppError('Aucune information de candidature à modifier', 400);
  }
  const application = await prisma.application.findUnique({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    select: { id: true },
  });
  if (!application) throw new AppError('Candidature non trouvée', 404);
  const safeData = {};
  if (status !== undefined) safeData.status = status;
  if (notes !== undefined) safeData.notes = notes;
  return prisma.application.update({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    data: safeData,
    select: {
      id: true, scholarshipId: true, status: true, notes: true,
      appliedAt: true, createdAt: true, updatedAt: true,
    },
  });
};

const incrementView = async (id) => {
  // Vérifie d'abord que la bourse est bien publiée et active.
  await getOne(id);
  return prisma.scholarship.update({
    where: { id },
    data: { views: { increment: 1 } },
  });
};

const getStats = async () => {
  const publicWhere = { status: 'APPROVED', isActive: true };
  const currentlyAvailableWhere = {
    ...publicWhere,
    OR: [{ deadline: null }, { deadline: { gte: new Date() } }],
  };
  const [total, active, byType] = await Promise.all([
    prisma.scholarship.count({ where: publicWhere }),
    prisma.scholarship.count({ where: currentlyAvailableWhere }),
    prisma.scholarship.groupBy({ by: ['type'], where: publicWhere, _count: true }),
  ]);

  return { total, active, byType };
};

const normalizeExternalUrl = (value, field, required = false) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`Le lien ${field} est obligatoire.`, 400);
    return value;
  }
  if (typeof value !== 'string' || value.length > 2048) {
    throw new AppError(`Le lien ${field} est invalide.`, 400);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AppError(`Le lien ${field} doit être une URL valide.`, 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username || parsed.password ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || !hostname.includes('.') ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    throw new AppError(`Le lien ${field} doit pointer vers un site web HTTP ou HTTPS public.`, 400);
  }

  return parsed.toString();
};

const create = async (data) => {
  const safeData = {
    ...data,
    link: normalizeExternalUrl(data.link, 'de candidature', true),
  };
  if (data.providerLogo !== undefined) {
    safeData.providerLogo = normalizeExternalUrl(data.providerLogo, 'du logo');
  }
  return prisma.scholarship.create({ data: safeData });
};

const update = async (id, data) => {
  const safeData = { ...data };
  if (data.link !== undefined) {
    safeData.link = normalizeExternalUrl(data.link, 'de candidature', true);
  }
  if (data.providerLogo !== undefined) {
    safeData.providerLogo = normalizeExternalUrl(data.providerLogo, 'du logo');
  }
  return prisma.scholarship.update({ where: { id }, data: safeData });
};
const remove = async (id) => prisma.scholarship.delete({ where: { id } });

module.exports = { getAllAdmin, getAll, getFeatured, getOne, getRecommended, saveScholarship, unsaveScholarship, trackApplication, updateApplication, incrementView, getStats, create, update, remove };
