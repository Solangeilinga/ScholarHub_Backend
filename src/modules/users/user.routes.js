const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);
router.delete('/account', userController.deleteAccount);
router.get('/saved', userController.getSaved);
router.get('/applications', userController.getApplications);
router.put('/fcm-token', userController.updateFcmToken);

module.exports = router;
