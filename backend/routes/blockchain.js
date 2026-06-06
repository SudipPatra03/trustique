/**
 * Blockchain Routes (all protected by JWT auth)
 * GET /api/blockchain          - Get full blockchain
 * GET /api/blockchain/validate - Validate chain integrity
 * GET /api/blockchain/export   - Export blockchain as JSON file
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getBlockchain,
  validateBlockchain,
  exportBlockchain,
} = require('../controllers/blockchainController');

// All blockchain routes require authentication
router.use(authMiddleware);

router.get('/validate', validateBlockchain);
router.get('/export', exportBlockchain);
router.get('/', getBlockchain);

module.exports = router;
