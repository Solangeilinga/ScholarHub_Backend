const express = require('express');
const router = express.Router();
const { chat, getHistory } = require('./chat.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.post('/', authenticate, chat);
router.get('/history', authenticate, getHistory);

module.exports = router;