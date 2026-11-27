const express = require('express');
const { body, param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Protection ciblée des opérations sensibles d'authentification.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de créations de compte depuis cette adresse. Réessayez dans une heure.' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes. Réessayez dans une heure.' },
});

const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes de renouvellement. Réessayez plus tard.' },
});

const registerValidation = [
  body('name').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 }).withMessage('Le mot de passe doit contenir entre 8 et 128 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir majuscule, minuscule et chiffre'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isString().isLength({ min: 1, max: 128 }).withMessage('Mot de passe invalide'),
];

router.post('/register', registerLimiter, registerValidation, authController.register);
router.post('/login', loginLimiter, loginValidation, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/forgot-password', passwordResetLimiter, body('email').isEmail().normalizeEmail(), authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, [
  body('token').isUUID(4).withMessage('Token invalide'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 }).withMessage('Le mot de passe doit contenir entre 8 et 128 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir majuscule, minuscule et chiffre'),
], authController.resetPassword);
router.get('/verify-email/:token', param('token').isUUID(4), authController.verifyEmail);
router.post('/refresh-token', refreshTokenLimiter, body('token').isString().isLength({ min: 1, max: 4096 }), authController.refreshToken);

module.exports = router;