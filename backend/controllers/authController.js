/**
 * Authentication Controller
 * Handles user registration (with OTP verification), login,
 * OTP verification/resend, forgot password, and password reset.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOtpEmail, generateOtp } = require('../utils/email');
const { hashSHA256, encrypt, safeDecrypt } = require('../utils/encryption');

function getNameAbbreviation(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

// OTP validity duration: 10 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Register a new user
 * POST /api/auth/register
 * Body: { name, email, password }
 *
 * Creates the user with isVerified=false and sends an OTP email.
 * If an unverified user already exists with the same email, updates their info and resends OTP.
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    // Check if user already exists
    const hashedEmail = hashSHA256(email.toLowerCase());
    const encryptedEmail = encrypt(email.toLowerCase());
    const encryptedName = encrypt(name);
    const abbreviation = getNameAbbreviation(name);

    const existingUser = await User.findOne({ emailHash: hashedEmail });

    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    // Hash password with bcrypt (salt rounds = 12)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);

    let user;

    if (existingUser && !existingUser.isVerified) {
      // Update existing unverified user
      existingUser.name = encryptedName;
      existingUser.nameAbbreviation = abbreviation;
      existingUser.email = encryptedEmail;
      existingUser.password = hashedPassword;
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
      user = existingUser;
    } else {
      // Create new user
      user = await User.create({
        name: encryptedName,
        email: encryptedEmail,
        emailHash: hashedEmail,
        nameAbbreviation: abbreviation,
        password: hashedPassword,
        isVerified: false,
        otp,
        otpExpires,
      });
    }

    // Send OTP email
    await sendOtpEmail(email.toLowerCase(), name, otp, 'verification');

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email with the OTP sent.',
      requiresVerification: true,
      email: email.toLowerCase(),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration.',
    });
  }
};

/**
 * Verify OTP after registration
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required.',
      });
    }

    const hashedEmail = hashSHA256(email.toLowerCase());
    const user = await User.findOne({ emailHash: hashedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
      });
    }

    // Check OTP validity
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Mark as verified and clear OTP
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate JWT token (expires in 7 days)
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully.',
      token,
      user: {
        _id: user._id,
        name: safeDecrypt(user.name, user.nameAbbreviation),
        fullName: safeDecrypt(user.name, user.nameAbbreviation),
        email: safeDecrypt(user.email, ''),
        profilePhoto: user.profilePhoto || '',
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during OTP verification.',
    });
  }
};

/**
 * Resend OTP for email verification
 * POST /api/auth/resend-otp
 * Body: { email }
 */
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const hashedEmail = hashSHA256(email.toLowerCase());
    const user = await User.findOne({ emailHash: hashedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.',
      });
    }

    // Generate new OTP
    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    await user.save();

    // Send OTP email
    await sendOtpEmail(email.toLowerCase(), user.nameAbbreviation, otp, 'verification');

    res.json({
      success: true,
      message: 'OTP resent successfully. Check your email.',
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error resending OTP.',
    });
  }
};

/**
 * Login an existing user
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    // Find user by email
    const hashedEmail = hashSHA256(email.toLowerCase());
    const user = await User.findOne({ emailHash: hashedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Compare password with bcrypt hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      // Resend OTP automatically
      const otp = generateOtp();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
      await user.save();

      await sendOtpEmail(email.toLowerCase(), user.nameAbbreviation, otp, 'verification');

      return res.status(403).json({
        success: false,
        message: 'Email not verified. A new OTP has been sent to your email.',
        requiresVerification: true,
        email: email.toLowerCase(),
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update online status
    user.isOnline = true;
    await user.save();

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        _id: user._id,
        name: safeDecrypt(user.name, user.nameAbbreviation),
        fullName: safeDecrypt(user.name, user.nameAbbreviation),
        email: safeDecrypt(user.email, ''),
        profilePhoto: user.profilePhoto || '',
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
};

/**
 * Forgot Password — send OTP to reset password
 * POST /api/auth/forgot-password
 * Body: { email }
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    const hashedEmail = hashSHA256(email.toLowerCase());
    const user = await User.findOne({ emailHash: hashedEmail });

    if (!user) {
      // Don't reveal whether the email exists
      return res.json({
        success: true,
        message: 'If this email is registered, an OTP has been sent.',
      });
    }

    // Generate OTP for password reset
    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
    await user.save();

    await sendOtpEmail(email.toLowerCase(), user.nameAbbreviation, otp, 'password_reset');

    res.json({
      success: true,
      message: 'If this email is registered, an OTP has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing forgot password.',
    });
  }
};

/**
 * Reset Password — verify OTP and set new password
 * POST /api/auth/reset-password
 * Body: { email, otp, newPassword }
 */
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    const hashedEmail = hashSHA256(email.toLowerCase());
    const user = await User.findOne({ emailHash: hashedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Check OTP validity
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpires = null;
    user.isVerified = true; // Ensure verified after reset
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error resetting password.',
    });
  }
};

module.exports = { register, login, verifyOtp, resendOtp, forgotPassword, resetPassword };
