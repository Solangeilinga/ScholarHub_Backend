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


const app = express();

// ⚡ Important pour Railway / proxys
app.set('trust proxy', 1);

// Security middlewares
app.use(helmet());
app.use(cors({
  origin: true, // ton frontend en prod
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting (appliqué seulement aux routes /api)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true, // Retourne X-RateLimit-* headers
  legacyHeaders: false, // Désactive les headers X-RateLimit obsolètes
});
app.use('/api/', limiter);

// Body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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


//chatbot route
app.use('/api/chat', chatRoutes);

//support route

app.use('/api/support', supportRoutes);

// API Routes
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