const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', [
  body('currentPassword').isString().notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword')
    .isString()
    .isLength({ min: 8 }).withMessage('Mot de passe minimum 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir une majuscule, une minuscule et un chiffre'),
], userController.changePassword);
router.delete('/account', userController.deleteAccount);
router.get('/saved', userController.getSaved);
router.get('/applications', userController.getApplications);
router.patch('/fcm-token', userController.updateFcmToken);

module.exports = router;
