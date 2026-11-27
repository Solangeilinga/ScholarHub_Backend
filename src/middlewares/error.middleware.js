const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Les détails complets restent dans les journaux du serveur, jamais dans la réponse publique.
  logger.error(err.message || 'Erreur inconnue', { stack: err.stack, path: req.originalUrl, method: req.method });

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Cette ressource existe déjà' });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Ressource non trouvée' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La requête est trop volumineuse' });
  }

  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return res.status(400).json({ error: 'Le format JSON de la requête est invalide' });
  }

  if (err.message === 'Origine non autorisée par la politique CORS') {
    return res.status(403).json({ error: 'Origine non autorisée' });
  }

  const requestedStatus = Number(err.statusCode || err.status);
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 500
    ? requestedStatus
    : 500;
  const isSafeClientError = statusCode < 500 && err.isOperational === true;
  const message = isSafeClientError
    ? err.message
    : 'Une erreur interne est survenue. Veuillez réessayer plus tard.';

  return res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, AppError };
