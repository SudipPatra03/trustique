/**
 * User Controller
 * Handles fetching user lists, searching, and individual user profiles
 * Includes in-memory caching to reduce MongoDB Atlas round-trips
 */

const User = require('../models/User');
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

/**
 * Get all users (excluding the authenticated user)
 * GET /api/users
 */
const getAllUsers = async (req, res) => {
  try {
    const cacheKey = `users:${req.user._id}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ success: true, users: cached });
    }

    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name nameAbbreviation isOnline profilePhoto')
      .lean(); // .lean() returns plain JS objects — faster than Mongoose docs

    const mappedUsers = users.map(u => ({
      _id: u._id,
      name: safeDecrypt(u.name, u.nameAbbreviation),
      nameAbbreviation: u.nameAbbreviation,
      isOnline: u.isOnline,
      profilePhoto: u.profilePhoto || '',
    }));

    mappedUsers.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    setCache(cacheKey, mappedUsers);

    res.json({
      success: true,
      users: mappedUsers,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users.',
    });
  }
};

/**
 * Search users by name
 * GET /api/users/search?q=name
 */
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a search query.',
      });
    }

    const query = q.trim().toLowerCase();

    // Try to use cached user list for searching instead of hitting DB
    const cacheKey = `users:${req.user._id}`;
    let mappedUsers = getCached(cacheKey);

    if (!mappedUsers) {
      const users = await User.find({ _id: { $ne: req.user._id } })
        .select('name nameAbbreviation isOnline profilePhoto')
        .lean();

      mappedUsers = users.map(u => ({
        _id: u._id,
        name: safeDecrypt(u.name, u.nameAbbreviation),
        nameAbbreviation: u.nameAbbreviation,
        isOnline: u.isOnline,
        profilePhoto: u.profilePhoto || '',
      }));

      setCache(cacheKey, mappedUsers);
    }

    const filteredUsers = mappedUsers.filter(u => 
      u.name.toLowerCase().includes(query) || 
      u.nameAbbreviation.toLowerCase().includes(query)
    );

    filteredUsers.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      users: filteredUsers.slice(0, 20),
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error searching users.',
    });
  }
};

/**
 * Get a single user by ID
 * GET /api/users/:id
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name nameAbbreviation isOnline profilePhoto')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: safeDecrypt(user.name, user.nameAbbreviation),
        nameAbbreviation: user.nameAbbreviation,
        isOnline: user.isOnline,
        profilePhoto: user.profilePhoto || '',
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user.',
    });
  }
};

/**
 * Update Profile Photo
 * PATCH /api/users/profile-photo
 */
const updateProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo provided.' });
    }

    const photoUrl = `/uploads/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhoto: photoUrl },
      { new: true }
    );

    // Invalidate user list cache
    cache.clear();

    res.json({
      success: true,
      message: 'Profile photo updated.',
      user: {
        _id: user._id,
        name: user.nameAbbreviation,
        fullName: safeDecrypt(user.name, user.nameAbbreviation),
        email: safeDecrypt(user.email, ''),
        profilePhoto: user.profilePhoto || '',
        isOnline: user.isOnline,
        createdAt: user.createdAt,
      }
    });
  } catch (error) {
    console.error('Update profile photo error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile photo.' });
  }
};

module.exports = { getAllUsers, searchUsers, getUserById, updateProfilePhoto };
