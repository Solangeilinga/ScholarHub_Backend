const { validationResult } = require('express-validator');
const authService = require('./auth.service');

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, country } = req.body;
    const result = await authService.register({ name, email, password, country });

    res.status(201).json({
      message: 'Compte créé avec succès. Vérifiez votre email.',
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    res.json({
      message: 'Connexion réussie',
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

// Supprime le FCM token à la déconnexion
const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.json({ message: 'Instructions envoyées par email si le compte existe' });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    await authService.verifyEmail(req.params.token);
    res.json({ message: 'Email vérifié avec succès' });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { token } = req.body;
    const result = await authService.refreshToken(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, getMe, forgotPassword, resetPassword, verifyEmail, refreshToken };