const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  createTicket,
  getMyTickets,
  getAllTickets,
  replyTicket,
  closeTicket,
  deleteTicket,
} = require('./support.controller');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

const ticketCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Trop de demandes de support. Réessayez dans une heure.' },
});

// Étudiant
router.post('/', authenticate, ticketCreationLimiter, createTicket);
router.get('/my', authenticate, getMyTickets);
router.delete('/:id', authenticate, deleteTicket);

// Admin
router.get('/', authenticate, requireAdmin, getAllTickets);
router.post('/:id/reply', authenticate, requireAdmin, replyTicket);
router.patch('/:id/close', authenticate, requireAdmin, closeTicket);

module.exports = router;
