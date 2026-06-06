/**
 * Message Routes (all protected by JWT auth)
 * GET    /api/messages/:userId       - Get chat history with user
 * POST   /api/messages/send          - Send a message
 * POST   /api/messages/verify/:msgId - Verify message integrity
 * PATCH  /api/messages/read/:msgId   - Mark message as read
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  sendMessage,
  getMessages,
  verifyMessage,
  markAsRead,
  uploadFile,
  getUnreadCounts,
} = require('../controllers/messageController');

// All message routes require authentication
router.use(authMiddleware);

router.post('/upload', upload.single('file'), uploadFile);
router.post('/send', sendMessage);
router.post('/verify/:messageId', verifyMessage);
router.patch('/read/:messageId', markAsRead);
router.get('/unread-counts', getUnreadCounts);
router.get('/:userId', getMessages);

module.exports = router;
