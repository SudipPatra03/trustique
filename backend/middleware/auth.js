/**
 * JWT Authentication Middleware
 * Extracts and verifies JWT from Authorization header
 * Attaches user data to req.user for downstream handlers
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authUserCache = new Map();

const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // simple in-memory cache for user verification to avoid Atlas round-trips
    const cachedUser = authUserCache.get(decoded.userId);
    let user;

    if (cachedUser && (Date.now() - cachedUser.timestamp < 30000)) {
      user = cachedUser.user;
    } else {
      user = await User.findById(decoded.userId).select('-password').lean();
      if (user) {
        authUserCache.set(decoded.userId, {
          user,
          timestamp: Date.now()
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token may be invalid.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
    });
  }
};

module.exports = authMiddleware;
