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

router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, country: true, role: true, isVerified: true, createdAt: true },
      }),
      prisma.user.count(),
    ]);
    res.json({ users, pagination: { page: parseInt(page), total, totalPages: Math.ceil(total / limit) } });
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
