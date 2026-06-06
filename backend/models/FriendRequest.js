/**
 * FriendRequest Model
 * Manages friend request relationships between users
 * Status: pending → accepted / rejected
 */

const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Prevent duplicate requests between the same pair
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
// Index for fetching friends and pending requests efficiently
friendRequestSchema.index({ sender: 1, status: 1 });
friendRequestSchema.index({ receiver: 1, status: 1 });

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
