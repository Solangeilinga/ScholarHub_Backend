const express = require('express');
const router = express.Router();
const { chat } = require('./chat.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.post('/', authenticate, chat);

module.exports = router;