/**
 * Message Model
 * Stores AES-encrypted messages with initialization vectors for decryption
 * and SHA-256 hashes for blockchain verification
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  encryptedMessage: {
    type: String,
    required: true,
  },
  iv: {
    type: String,
    required: true,
  },
  messageHash: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  delivered: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for efficient chat history queries
messageSchema.index({ sender: 1, receiver: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
