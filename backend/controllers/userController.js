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
      .select('nameAbbreviation isOnline')
      .sort({ isOnline: -1, nameAbbreviation: 1 }); // Online users first, then alphabetical

    const mappedUsers = users.map(u => ({
      _id: u._id,
      name: u.nameAbbreviation,
      isOnline: u.isOnline,
    }));

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

    // Case-insensitive regex search on nameAbbreviation
    const users = await User.find({
      _id: { $ne: req.user._id },
      nameAbbreviation: { $regex: q.trim(), $options: 'i' },
    })
      .select('nameAbbreviation isOnline')
      .sort({ isOnline: -1, nameAbbreviation: 1 })
      .limit(20);

    const mappedUsers = users.map(u => ({
      _id: u._id,
      name: u.nameAbbreviation,
      isOnline: u.isOnline,
    }));

    res.json({
      success: true,
      users: mappedUsers,
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
    const user = await User.findById(req.params.id).select('nameAbbreviation isOnline');

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
        name: user.nameAbbreviation,
        isOnline: user.isOnline,
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

module.exports = { getAllUsers, searchUsers, getUserById };
