// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db } = require('./firebase');

const app = express();

/**
 * =========================
 * CORS CONFIG (FIXED)
 * =========================
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  'https://progress-tracker-frontend-tc8d.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // mobile apps / postman

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control']
}));

// Preflight
app.options('*', cors());

/**
 * =========================
 * MIDDLEWARE
 * =========================
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

/**
 * =========================
 * BASIC ROUTES
 * =========================
 */

app.get('/api', (req, res) => {
  res.json({
    message: 'Progress Tracker API running',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      settings: '/api/settings',
      inventory: '/api/inventory',
      bills: '/api/bills',
      suppliers: '/api/suppliers',
      transactions: '/api/transactions',
      purchaseOrders: '/api/purchase-orders',
      staff: '/api/staff',
      staffSettings: '/api/staff-settings',
      test: '/api/test',
      health: '/api/health',
      dbStatus: '/api/db-status'
    }
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    message: 'API working fine',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    database: db ? 'connected' : 'disconnected',
    memoryUsage: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db-status', (req, res) => {
  res.json({
    connected: !!db,
    provider: 'firebase',
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    timestamp: new Date().toISOString()
  });
});

/**
 * =========================
 * ROUTES IMPORTS
 * =========================
 */
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const inventoryRoutes = require('./routes/inventory');
const supplierRoutes = require('./routes/suppliers');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const transactionRoutes = require('./routes/transactions');
const billsRoutes = require('./routes/bills');
const staffRoutes = require('./routes/staff');
const staffSettingsRoutes = require('./routes/staffSettings');
const errorLogger = require('./middleware/errorLogger');

/**
 * =========================
 * ROUTE MIDDLEWARE
 * =========================
 */

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff-settings', staffSettingsRoutes);
app.use(errorLogger);

/**
 * =========================
 * 404 HANDLERS
 * =========================
 */

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
    requestedUrl: req.originalUrl
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableRoutes: [
      '/api',
      '/api/auth',
      '/api/settings',
      '/api/inventory',
      '/api/bills',
      '/api/suppliers',
      '/api/transactions',
      '/api/purchase-orders',
      '/api/staff',
      '/api/staff-settings',
      '/api/test',
      '/api/health',
      '/api/db-status'
    ]
  });
});

/**
 * =========================
 * ERROR HANDLER
 * =========================
 */

app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);
  console.error('Stack:', err.stack);

  // Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }

  // Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`
    });
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // CORS Errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS blocked this request'
    });
  }

  // Default Server Error
  res.status(500).json({
    success: false,
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * =========================
 * START SERVER
 * =========================
 */

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log('==============================');
  console.log('🚀 Server Started');
  console.log('==============================');
  console.log(`Port: ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`Test: http://localhost:${PORT}/api/test`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`DB Status: http://localhost:${PORT}/api/db-status`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('==============================');
});

/**
 * =========================
 * GRACEFUL SHUTDOWN
 * =========================
 */

const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    
    console.log('HTTP server closed.');
    console.log('Shutdown complete.');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app;