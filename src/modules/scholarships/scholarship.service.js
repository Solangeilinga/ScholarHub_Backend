const prisma = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');

const getAll = async ({ page = 1, limit = 10, search, country, field, level, type, language, deadlineDays }) => {
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
  if (field) where.fields = { hasSome: [field] };
  if (level) where.level = { has: level };
  if (type) where.type = type;
  if (language) where.languages = { has: language };

  if (deadlineDays) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + parseInt(deadlineDays));
    where.deadline = { lte: deadline, gte: new Date() };
  } else {
    // Les bourses sans date connue restent visibles ; seules les dates dépassées sont exclues.
    conditions.push({ OR: [{ deadline: null }, { deadline: { gte: new Date() } }] });
  }
  if (conditions.length) where.AND = conditions;

  const [scholarships, total] = await Promise.all([
    prisma.scholarship.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: [{ isFeatured: 'desc' }, { deadline: 'asc' }],
    }),
    prisma.scholarship.count({ where }),
  ]);

  return {
    scholarships,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllAdmin = async ({ page = 1, limit = 100, search }) => {
  const skip = (page - 1) * limit;
  const where = {}; // ← pas de filtre isActive ni deadline

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
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }, // ← les plus récentes en premier
    }),
    prisma.scholarship.count({ where }),
  ]);

  return { scholarships, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) } };
};


const getFeatured = async () => {
  return prisma.scholarship.findMany({
    where: { status: 'APPROVED', isActive: true, isFeatured: true, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] },
    take: 6,
    orderBy: { deadline: 'asc' },
  });
};

const getOne = async (id) => {
  // Une bourse non publiée ou désactivée ne doit jamais être accessible au public,
  // même si son identifiant est connu.
  const scholarship = await prisma.scholarship.findFirst({
    where: { id, status: 'APPROVED', isActive: true },
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
    orderBy: { createdAt: 'desc' },
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

const trackApplication = async (userId, scholarshipId, { status, notes }) => {
  await getOne(scholarshipId);
  return prisma.application.upsert({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    update: { status, notes },
    create: { userId, scholarshipId, status: status || 'SAVED', notes },
  });
};

const updateApplication = async (userId, scholarshipId, data) => {
  const application = await prisma.application.findUnique({
    where: { userId_scholarshipId: { userId, scholarshipId } },
  });
  if (!application) throw new AppError('Candidature non trouvée', 404);
  return prisma.application.update({
    where: { userId_scholarshipId: { userId, scholarshipId } },
    data,
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

const create = async (data) => prisma.scholarship.create({ data });
const update = async (id, data) => prisma.scholarship.update({ where: { id }, data });
const remove = async (id) => prisma.scholarship.delete({ where: { id } });

module.exports = { getAllAdmin, getAll, getFeatured, getOne, getRecommended, saveScholarship, unsaveScholarship, trackApplication, updateApplication, incrementView, getStats, create, update, remove };
