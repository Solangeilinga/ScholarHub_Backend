require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const scholarshipRoutes = require('./modules/scholarships/scholarship.routes');
const userRoutes = require('./modules/users/user.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const { errorHandler } = require('./middlewares/error.middleware');
const logger = require('./utils/logger');
const { startCronJobs } = require('./jobs/cron');
const chatRoutes = require('./modules/chat/chat.routes');
const supportRoutes = require('./modules/support/support.routes');
const scraperRoutes = require('./modules/scraper/scraper.routes')

const app = express();

// ⚡ Important pour Railway / proxys
app.set('trust proxy', 1);

// Security middlewares
app.use(helmet());

// CORS : autoriser les domaines web déclarés et les applications natives (sans Origin).
// FRONTEND_URL correspond au panel admin ; CORS_ORIGINS permet d'ajouter d'autres domaines.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || '').split(','),
]
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

// En production, refuser de démarrer avec une configuration d'authentification
// ou des origines web manifestement dangereuses/incomplètes.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
      /your_|change.?me|secret.?here/i.test(process.env.JWT_SECRET)) {
    throw new Error('Configuration invalide : JWT_SECRET doit être un secret aléatoire d’au moins 32 caractères.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Configuration invalide : DATABASE_URL est obligatoire en production.');
  }
  if (!process.env.FRONTEND_URL || allowedOrigins.length === 0) {
    throw new Error('Configuration invalide : FRONTEND_URL ou CORS_ORIGINS doit déclarer au moins une origine web.');
  }
  for (const origin of allowedOrigins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error('Configuration invalide : une origine CORS est mal formée.');
    }
    if (parsedOrigin.protocol !== 'https:' || parsedOrigin.username || parsedOrigin.password ||
        parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
      throw new Error('Configuration invalide : les origines CORS de production doivent être des URL HTTPS exactes.');
    }
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }
    return callback(new Error('Origine non autorisée par la politique CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting (appliqué seulement aux routes /api)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '2mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 100 }));

// Logging en dev uniquement
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    app: 'ScholarHub API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/admin/scraper', scraperRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/scholarships', scholarshipRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use(errorHandler);

// Start cron jobs
startCronJobs();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 ScholarHub API démarrée sur le port ${PORT}`);
  logger.info(`📖 Environnement: ${process.env.NODE_ENV}`);
});

module.exports = app;