const express = require('express');
const router = express.Router();
const { 
  createTicket, 
  getMyTickets, 
  getAllTickets, 
  replyTicket, 
  closeTicket,
  deleteTicket  // ← IMPORT ajouté
} = require('./support.controller');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

// Étudiant
router.post('/', authenticate, createTicket);
router.get('/my', authenticate, getMyTickets);
router.delete('/:id', authenticate, deleteTicket);  // ← NOUVELLE ROUTE pour étudiant

// Admin
router.get('/', authenticate, requireAdmin, getAllTickets);
router.post('/:id/reply', authenticate, requireAdmin, replyTicket);
router.patch('/:id/close', authenticate, requireAdmin, closeTicket);
// Optionnel: admin peut aussi supprimer (si nécessaire)
// router.delete('/:id/admin', authenticate, requireAdmin, deleteTicket);

module.exports = router;