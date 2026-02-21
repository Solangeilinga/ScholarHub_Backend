const express = require('express');
const router = express.Router();
const { createTicket, getMyTickets, getAllTickets, replyTicket, closeTicket } = require('./support.controller');
const { authenticate, requireAdmin } = require('../../middlewares/auth.middleware');

// Étudiant
router.post('/', authenticate, createTicket);
router.get('/my', authenticate, getMyTickets);

// Admin
router.get('/', authenticate, requireAdmin, getAllTickets);
router.post('/:id/reply', authenticate, requireAdmin, replyTicket);
router.patch('/:id/close', authenticate, requireAdmin, closeTicket);

module.exports = router;