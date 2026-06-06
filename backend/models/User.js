/**
 * User Model
 * Stores user credentials and online presence status
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    encryptedData: { type: String, required: true },
    iv: { type: String, required: true }
  },
  nameAbbreviation: {
    type: String,
    required: [true, 'Name abbreviation is required'],
    trim: true,
  },
  email: {
    encryptedData: { type: String, required: true },
    iv: { type: String, required: true }
  },
  emailHash: {
    type: String,
    required: [true, 'Email hash is required'],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    type: String,
    default: null,
  },
  otpExpires: {
    type: Date,
    default: null,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for search functionality
userSchema.index({ nameAbbreviation: 'text' });

module.exports = mongoose.model('User', userSchema);
