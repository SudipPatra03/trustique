/**
 * Authentication Routes
 * POST /api/auth/register        - Register new user (sends OTP)
 * POST /api/auth/login           - Login existing user
 * POST /api/auth/verify-otp      - Verify email OTP after registration
 * POST /api/auth/resend-otp      - Resend verification OTP
 * POST /api/auth/forgot-password - Request password reset OTP
 * POST /api/auth/reset-password  - Reset password with OTP
 */

const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
