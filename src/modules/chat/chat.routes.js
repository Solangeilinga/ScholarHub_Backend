const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { chat, getHistory } = require('./chat.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Trop de messages envoyés. Réessayez dans quelques minutes.' },
});

router.post('/', authenticate, chatLimiter, chat);
router.get('/history', authenticate, getHistory);

module.exports = router;