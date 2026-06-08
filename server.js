// server.js
require('dotenv').config();
const express = require('express');
const { db } = require('./firebase');
const cors = require('cors');

const app = express();

// CORS Middleware - Updated to allow all development origins
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all localhost ports and common development origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow specific production domains if needed
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:5002'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'] // ADD Cache-Control here
}));
// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.options('*', cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test API endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'POS SaaS API is working!',
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
      test: '/api/test',
      health: '/api/health',
      dbStatus: '/api/db-status'
    }
  });
});

// Add a simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

// Firebase Firestore
console.log('Firebase Firestore initialized for project:', process.env.FIREBASE_PROJECT_ID);

// Import routes (added staffRoutes)

const settingsRoutes = require('./routes/settings');
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const supplierRoutes = require('./routes/suppliers');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const transactionRoutes = require('./routes/transactions');
const billsRoutes = require('./routes/bills');
const staffRoutes = require('./routes/staff');
const staffSettingsRoutes = require('./routes/staffSettings');
const errorLogger = require('./middleware/errorLogger');
// Added staff routes
// Middleware
app.use(express.json());

// Mount routes with /api prefix (added staff route)
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
// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: db ? 'connected' : 'disconnected',
    memoryUsage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(healthStatus);
});

// Database status endpoint
app.get('/api/db-status', (req, res) => {
  const dbStatus = {
    connected: !!db,
    provider: 'firebase',
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    readyStateDescription: db ? 'connected' : 'disconnected'
  };
  
  res.status(200).json(dbStatus);
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    status: 'error', 
    message: 'API route not found',
    requestedUrl: req.originalUrl
  });
});

// General 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    status: 'error', 
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
      '/api/staff', // Added staff route
      '/api/test',
      '/api/health',
      '/api/db-status'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    return res.status(400).json({ 
      status: 'fail', 
      message: 'Validation error', 
      errors 
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ 
      status: 'fail', 
      message: `${field} already exists` 
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      status: 'fail', 
      message: 'Invalid token' 
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ 
      status: 'fail', 
      message: 'Token expired' 
    });
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      status: 'error', 
      message: 'CORS error: Request not allowed from this origin' 
    });
  }

  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// Server listen
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n=== POS SaaS Server Started ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`DB status: http://localhost:${PORT}/api/db-status`);
  console.log(`CORS enabled for all localhost origins`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`================================\n`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    
    console.log('HTTP server closed.');
    
    console.log('Firebase connection closed');
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