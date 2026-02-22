const express = require('express');
const router = express.Router();
const prisma = require('../../config/db');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

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

// ← Route admin pour toutes les bourses sans filtre
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
        where,
        skip,
        take: parseInt(limit),
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json({ user });
  } catch (error) { next(error); }
});

module.exports = router;