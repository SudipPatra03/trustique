/**
 * User Routes (all protected by JWT auth)
 * GET /api/users          - Get all users
 * GET /api/users/search   - Search users by name
 * GET /api/users/:id      - Get single user
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getAllUsers, searchUsers, getUserById, updateProfilePhoto } = require('../controllers/userController');
const upload = require('../middleware/upload');

// All user routes require authentication
router.use(authMiddleware);

router.patch('/profile-photo', upload.single('photo'), updateProfilePhoto);
router.get('/search', searchUsers);
router.get('/:id', getUserById);
router.get('/', getAllUsers);

module.exports = router;
