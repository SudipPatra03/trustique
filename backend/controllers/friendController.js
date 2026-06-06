/**
 * Friend Controller
 * Handles sending, accepting, rejecting friend requests
 * and fetching friends list and pending requests
 */

const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const { getIo, onlineUsers } = require('../sockets/socketHandler');
const { safeDecrypt } = require('../utils/encryption');

// ---- Simple in-memory cache ----
const cache = new Map();
const CACHE_TTL = 10 * 1000; // 10 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function invalidateCache(userId) {
  // Clear any cache entries related to this user
  for (const key of cache.keys()) {
    if (key.includes(userId)) cache.delete(key);
  }
}

/**
 * Send a friend request
 * POST /api/friends/request
 * Body: { receiverId }
 */
const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId } = req.body;

    // Validate receiverId is provided and is a valid MongoDB ObjectId
    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'Receiver ID is required.' });
    }
    if (typeof receiverId !== 'string' || receiverId.length !== 24 || !/^[0-9a-f]{24}$/.test(receiverId)) {
      return res.status(400).json({ success: false, message: 'Invalid receiver ID format.' });
    }

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ success: false, message: 'Cannot send friend request to yourself.' });
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check if a request already exists in either direction
    const existing = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'Already friends.' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ success: false, message: 'Friend request already pending.' });
      }
      // If rejected, allow re-sending by updating status
      existing.status = 'pending';
      existing.sender = senderId;
      existing.receiver = receiverId;
      existing.createdAt = new Date();
      await existing.save();

      return res.status(200).json({
        success: true,
        message: 'Friend request sent.',
        request: existing,
      });
    }

    const request = await FriendRequest.create({
      sender: senderId,
      receiver: receiverId,
    });

    await request.populate('sender', 'name nameAbbreviation profilePhoto');
    await request.populate('receiver', 'name nameAbbreviation profilePhoto');

    const mappedRequest = {
      ...request.toObject(),
      sender: request.sender ? { 
        _id: request.sender._id, 
        name: safeDecrypt(request.sender.name, request.sender.nameAbbreviation),
        nameAbbreviation: request.sender.nameAbbreviation,
        profilePhoto: request.sender.profilePhoto || '' 
      } : null,
      receiver: request.receiver ? { 
        _id: request.receiver._id, 
        name: safeDecrypt(request.receiver.name, request.receiver.nameAbbreviation),
        nameAbbreviation: request.receiver.nameAbbreviation,
        profilePhoto: request.receiver.profilePhoto || '' 
      } : null
    };

    res.status(201).json({
      success: true,
      message: 'Friend request sent.',
      request: mappedRequest,
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ success: false, message: 'Server error sending friend request.' });
  }
};

/**
 * Accept a friend request
 * PATCH /api/friends/accept/:requestId
 */
const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    // Validate requestId is a valid MongoDB ObjectId
    if (!requestId || requestId.length !== 24 || !/^[0-9a-f]{24}$/.test(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID format.' });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Friend request not found.' });
    }

    // Only the receiver can accept
    if (request.receiver.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already handled.' });
    }

    request.status = 'accepted';
    invalidateCache(userId.toString());
    invalidateCache(request.sender.toString());
    await request.save();

    await request.populate('sender', 'name nameAbbreviation profilePhoto');
    await request.populate('receiver', 'name nameAbbreviation profilePhoto');

    const mappedRequest = {
      ...request.toObject(),
      sender: request.sender ? { 
        _id: request.sender._id, 
        name: safeDecrypt(request.sender.name, request.sender.nameAbbreviation),
        nameAbbreviation: request.sender.nameAbbreviation,
        profilePhoto: request.sender.profilePhoto || '' 
      } : null,
      receiver: request.receiver ? { 
        _id: request.receiver._id, 
        name: safeDecrypt(request.receiver.name, request.receiver.nameAbbreviation),
        nameAbbreviation: request.receiver.nameAbbreviation,
        profilePhoto: request.receiver.profilePhoto || '' 
      } : null
    };

    res.json({
      success: true,
      message: 'Friend request accepted.',
      request: mappedRequest,
    });

    // Notify sender in real-time
    const io = getIo();
    if (io) {
      const senderSockets = onlineUsers.get(request.sender._id.toString());
      if (senderSockets) {
        senderSockets.forEach(socketId => {
          io.to(socketId).emit('friend:request:accepted', { from: req.user._id, name: req.user.nameAbbreviation });
        });
      }
    }
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ success: false, message: 'Server error accepting friend request.' });
  }
};

/**
 * Reject a friend request
 * PATCH /api/friends/reject/:requestId
 */
const rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestId } = req.params;

    // Validate requestId is a valid MongoDB ObjectId
    if (!requestId || requestId.length !== 24 || !/^[0-9a-f]{24}$/.test(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID format.' });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Friend request not found.' });
    }

    // Only the receiver can reject
    if (request.receiver.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already handled.' });
    }

    request.status = 'rejected';
    await request.save();

    res.json({
      success: true,
      message: 'Friend request rejected.',
    });

    // Notify sender in real-time
    const io = getIo();
    if (io) {
      const senderSockets = onlineUsers.get(request.sender.toString());
      if (senderSockets) {
        senderSockets.forEach(socketId => {
          io.to(socketId).emit('friend:request:rejected', { from: req.user._id, name: req.user.nameAbbreviation });
        });
      }
    }
  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting friend request.' });
  }
};

/**
 * Get pending friend requests for the current user
 * GET /api/friends/requests
 */
const getFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const requests = await FriendRequest.find({
      receiver: userId,
      status: 'pending',
    })
      .populate('sender', 'name nameAbbreviation profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    const mappedRequests = requests.map(r => ({
      ...r,
      sender: r.sender ? { 
        _id: r.sender._id, 
        name: safeDecrypt(r.sender.name, r.sender.nameAbbreviation),
        nameAbbreviation: r.sender.nameAbbreviation,
        profilePhoto: r.sender.profilePhoto || '' 
      } : null,
      receiver: r.receiver ? { 
        _id: r.receiver._id, 
        name: safeDecrypt(r.receiver.name, r.receiver.nameAbbreviation),
        nameAbbreviation: r.receiver.nameAbbreviation,
        profilePhoto: r.receiver.profilePhoto || '' 
      } : null
    }));

    res.json({ success: true, requests: mappedRequests });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching friend requests.' });
  }
};

/**
 * Get friends list for the current user (accepted requests)
 * GET /api/friends
 */
const getFriends = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const cacheKey = `friends:${userId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ success: true, friends: cached });
    }

    const friendships = await FriendRequest.find({
      $or: [
        { sender: userId, status: 'accepted' },
        { receiver: userId, status: 'accepted' },
      ],
    })
      .populate('sender', 'name nameAbbreviation isOnline profilePhoto')
      .populate('receiver', 'name nameAbbreviation isOnline profilePhoto')
      .lean();

    // Extract friend user objects, ignoring any where sender or receiver is deleted/null
    const friends = friendships
      .filter((f) => f.sender && f.receiver)
      .map((f) => {
        const friend = f.sender._id.toString() === userId ? f.receiver : f.sender;
        return {
          _id: friend._id,
          name: safeDecrypt(friend.name, friend.nameAbbreviation),
          nameAbbreviation: friend.nameAbbreviation,
          email: '',
          isOnline: friend.isOnline,
          profilePhoto: friend.profilePhoto || '',
          friendshipId: f._id,
        };
      });

    setCache(cacheKey, friends);

    res.json({ success: true, friends });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching friends.' });
  }
};

/**
 * Check friendship status between current user and another user
 * GET /api/friends/status/:userId
 */
const checkFriendship = async (req, res) => {
  try {
    const currentUser = req.user._id;
    const otherUser = req.params.userId;

    // Validate otherUser is a valid MongoDB ObjectId
    if (!otherUser || otherUser.length !== 24 || !/^[0-9a-f]{24}$/.test(otherUser)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    const request = await FriendRequest.findOne({
      $or: [
        { sender: currentUser, receiver: otherUser },
        { sender: otherUser, receiver: currentUser },
      ],
    });

    if (!request) {
      return res.json({ success: true, status: 'none' });
    }

    res.json({
      success: true,
      status: request.status,
      requestId: request._id,
      isSender: request.sender.toString() === currentUser.toString(),
    });
  } catch (error) {
    console.error('Check friendship error:', error);
    res.status(500).json({ success: false, message: 'Server error checking friendship.' });
  }
};

/**
 * Unfriend a user (removes the accepted friend request)
 * DELETE /api/friends/unfriend/:friendId
 */
const unfriend = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    // Validate friendId is provided and is a valid MongoDB ObjectId
    if (!friendId) {
      return res.status(400).json({ success: false, message: 'Friend ID is required.' });
    }
    if (typeof friendId !== 'string' || friendId.length !== 24 || !/^[0-9a-f]{24}$/.test(friendId)) {
      return res.status(400).json({ success: false, message: 'Invalid friend ID format.' });
    }

    // Delete friendship request
    const request = await FriendRequest.findOneAndDelete({
      $or: [
        { sender: userId, receiver: friendId, status: 'accepted' },
        { sender: friendId, receiver: userId, status: 'accepted' },
      ],
    });

    // Invalidate cache for both users
    invalidateCache(userId.toString());
    invalidateCache(friendId.toString());

    if (!request) {
      return res.status(404).json({ success: false, message: 'Friendship not found.' });
    }

    res.json({
      success: true,
      message: 'Friend removed successfully.',
    });

    // Notify the other user in real-time
    const io = getIo();
    if (io) {
      const otherSockets = onlineUsers.get(friendId.toString());
      if (otherSockets) {
        otherSockets.forEach(socketId => {
          io.to(socketId).emit('friend:unfriended', { from: userId.toString(), name: req.user.nameAbbreviation });
        });
      }
    }
  } catch (error) {
    console.error('Unfriend error:', error);
    res.status(500).json({ success: false, message: 'Server error unfriending.' });
  }
};

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendRequests,
  getFriends,
  checkFriendship,
  unfriend,
};
