/**
 * Block Model
 * Represents a single block in the message verification blockchain
 * Each block contains a SHA-256 hash of a message and links to the previous block
 */

const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  index: {
    type: Number,
    required: true,
    unique: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  messageHash: {
    type: String,
    required: true,
  },
  previousHash: {
    type: String,
    required: true,
  },
  hash: {
    type: String,
    required: true,
  },
  nonce: {
    type: Number,
    default: 0,
  },
});

// Index for quick lookups by messageHash (used in verification)
blockSchema.index({ messageHash: 1 });

module.exports = mongoose.model('Block', blockSchema);
