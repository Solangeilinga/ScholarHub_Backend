const express = require('express');
const router = express.Router();
const scholarshipController = require('./scholarship.controller');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

// Public routes
router.get('/', scholarshipController.getAll);
router.get('/featured', scholarshipController.getFeatured);
router.get('/stats', scholarshipController.getStats);
router.get('/admin/all', authenticate, requireAdmin, scholarshipController.getAllAdmin);

// Protected routes
router.get('/user/recommended', authenticate, scholarshipController.getRecommended);
router.post('/:id/save', authenticate, scholarshipController.saveScholarship);
router.delete('/:id/save', authenticate, scholarshipController.unsaveScholarship);
router.post('/:id/apply', authenticate, scholarshipController.trackApplication);
router.patch('/:id/apply', authenticate, scholarshipController.updateApplication);
router.post('/:id/view', scholarshipController.incrementView);

// Admin routes
router.post('/', authenticate, requireAdmin, scholarshipController.create);
router.put('/:id', authenticate, requireAdmin, scholarshipController.update);
router.delete('/:id', authenticate, requireAdmin, scholarshipController.remove);

// ← /:id doit être en dernier sinon il capture tout
router.get('/:id', scholarshipController.getOne);

module.exports = router;