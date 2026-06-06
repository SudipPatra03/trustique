/**
 * User Controller
 * Handles fetching user lists, searching, and individual user profiles
 */

const User = require('../models/User');

/**
 * Get all users (excluding the authenticated user)
 * GET /api/users
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name isOnline profilePhoto')
      .sort({ isOnline: -1, name: 1 }); // Online users first, then alphabetical

    res.json({
      success: true,
      users,
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

    // Case-insensitive regex search on name
    const users = await User.find({
      _id: { $ne: req.user._id },
      name: { $regex: q.trim(), $options: 'i' },
    })
      .select('name isOnline profilePhoto')
      .sort({ isOnline: -1, name: 1 })
      .limit(20);

    res.json({
      success: true,
      users,
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
    const user = await User.findById(req.params.id).select('name isOnline profilePhoto');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.json({
      success: true,
      user,
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
    ).select('name email profilePhoto');

    res.json({
      success: true,
      message: 'Profile photo updated.',
      user
    });
  } catch (error) {
    console.error('Update profile photo error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile photo.' });
  }
};

module.exports = { getAllUsers, searchUsers, getUserById, updateProfilePhoto };
