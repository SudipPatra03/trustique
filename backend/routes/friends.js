/**
 * Friend Routes (all protected by JWT auth)
 * POST   /api/friends/request          - Send friend request
 * PATCH  /api/friends/accept/:id       - Accept friend request
 * PATCH  /api/friends/reject/:id       - Reject friend request
 * GET    /api/friends/requests          - Get pending requests
 * GET    /api/friends/status/:userId    - Check friendship status
 * GET    /api/friends                   - Get friends list
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendRequests,
  getFriends,
  checkFriendship,
  unfriend,
} = require('../controllers/friendController');

// All friend routes require authentication
router.use(authMiddleware);

router.post('/request', sendFriendRequest);
router.patch('/accept/:requestId', acceptFriendRequest);
router.patch('/reject/:requestId', rejectFriendRequest);
router.get('/requests', getFriendRequests);
router.get('/status/:userId', checkFriendship);
router.get('/', getFriends);
router.delete('/unfriend/:friendId', unfriend);

module.exports = router;
