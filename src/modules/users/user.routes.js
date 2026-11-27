const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.get('/data-export', userController.exportPersonalData);
router.put('/profile', [
  body('name').optional().isString().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('country').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('Pays invalide'),
  body('nationality').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('Nationalité invalide'),
  body('level').optional({ nullable: true }).isIn([
    'BEPC', 'BACCALAUREAT', 'LICENCE_1', 'LICENCE_2', 'LICENCE_3', 'LICENCE',
    'MAITRISE', 'MASTER_1', 'MASTER_2', 'MASTER', 'DOCTORAT_1', 'DOCTORAT_2', 'DOCTORAT',
  ]).withMessage('Niveau d’études invalide'),
  body('fields').optional().isArray({ max: 30 }).withMessage('La liste des domaines est invalide'),
  body('fields.*').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('languages').optional().isArray({ max: 20 }).withMessage('La liste des langues est invalide'),
  body('languages.*').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('bio').optional({ nullable: true }).isString().isLength({ max: 1000 }).withMessage('La présentation ne doit pas dépasser 1000 caractères'),
  body('notificationsEnabled').optional().isBoolean().withMessage('Préférence de notification invalide'),
], userController.updateProfile);
router.put('/change-password', [
  body('currentPassword').isString().isLength({ min: 1, max: 128 }).withMessage('Mot de passe actuel invalide'),
  body('newPassword')
    .isString()
    .isLength({ min: 8, max: 128 }).withMessage('Le nouveau mot de passe doit contenir entre 8 et 128 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir une majuscule, une minuscule et un chiffre'),
], userController.changePassword);
router.delete('/account', body('password').isString().notEmpty().withMessage('Mot de passe requis'), userController.deleteAccount);
router.get('/saved', userController.getSaved);
router.get('/applications', userController.getApplications);
router.patch('/fcm-token', body('fcmToken').custom((value) => value === null || (typeof value === 'string' && value.length <= 4096)).withMessage('Token de notification invalide'), userController.updateFcmToken);

module.exports = router;
