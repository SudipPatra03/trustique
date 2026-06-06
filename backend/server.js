/**
 * Trustique — Server Entry Point
 * Express.js + Socket.IO + MongoDB
 * Serves the frontend as static files and provides the REST API
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Database connection
const connectDB = require('./config/db');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const blockchainRoutes = require('./routes/blockchain');
const friendRoutes = require('./routes/friends');

// Socket handler
const { initializeSocketHandlers } = require('./sockets/socketHandler');

// Blockchain
const { Blockchain } = require('./blockchain/blockchain');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

// =========================
// Middleware
// =========================

// Security headers (relaxed for development — tighten for production)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors());

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  maxAge: '1d',
  etag: false,
}));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: false,
}));

// =========================
// API Routes
// =========================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/friends', friendRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});


// Catch-all: serve frontend for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// =========================
// Error handling middleware
// =========================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.',
  });
});

// =========================
// Start Server
// =========================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Reset all users' online status on startup
    const User = require('./models/User');
    await User.updateMany({}, { isOnline: false });
    console.log('🧹 Cleaned up online statuses in database');

    // Initialize genesis block
    await Blockchain.createGenesisBlock();

    // Initialize Socket.IO handlers
    initializeSocketHandlers(io);

    // Start listening
    server.listen(PORT, () => {
      console.log(`\n🚀 Trustique running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready`);
      console.log(`🔗 Blockchain initialized\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
