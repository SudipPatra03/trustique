/**
 * Blockchain Controller
 * Handles blockchain queries: fetch all blocks, validate chain, and export as JSON
 */

const Block = require('../models/Block');
const { Blockchain } = require('../blockchain/blockchain');

/**
 * Get the full blockchain
 * GET /api/blockchain
 */
const getBlockchain = async (req, res) => {
  try {
    const blocks = await Block.find()
      .populate('sender', 'name email')
      .populate('receiver', 'name email')
      .sort({ index: 1 });

    const sanitizedBlocks = blocks.map((b) => {
      const isParticipant =
        (b.sender && b.sender._id.toString() === req.user._id.toString()) ||
        (b.receiver && b.receiver._id.toString() === req.user._id.toString());

      return {
        _id: b._id,
        index: b.index,
        timestamp: b.timestamp,
        sender: b.sender
          ? isParticipant
            ? { _id: b.sender._id, name: b.sender.name, email: b.sender.email }
            : { _id: b.sender._id, name: 'Hidden User', email: 'hidden@trustique.local' }
          : null,
        receiver: b.receiver
          ? isParticipant
            ? { _id: b.receiver._id, name: b.receiver.name, email: b.receiver.email }
            : { _id: b.receiver._id, name: 'Hidden User', email: 'hidden@trustique.local' }
          : null,
        messageHash: b.messageHash,
        previousHash: b.previousHash,
        hash: b.hash,
        nonce: b.nonce,
      };
    });

    res.json({
      success: true,
      totalBlocks: sanitizedBlocks.length,
      blocks: sanitizedBlocks,
    });
  } catch (error) {
    console.error('Get blockchain error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blockchain.',
    });
  }
};

/**
 * Validate the entire blockchain integrity
 * GET /api/blockchain/validate
 */
const validateBlockchain = async (req, res) => {
  try {
    const result = await Blockchain.validateChain();

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Validate blockchain error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error validating blockchain.',
    });
  }
};

/**
 * Export the blockchain as a downloadable JSON file
 * GET /api/blockchain/export
 */
const exportBlockchain = async (req, res) => {
  try {
    const blocks = await Block.find()
      .populate('sender', 'name email')
      .populate('receiver', 'name email')
      .sort({ index: 1 });

    const exportData = {
      chainName: 'Trustique',
      exportedAt: new Date().toISOString(),
      totalBlocks: blocks.length,
      blocks: blocks.map((b) => {
        const isParticipant =
          (b.sender && b.sender._id.toString() === req.user._id.toString()) ||
          (b.receiver && b.receiver._id.toString() === req.user._id.toString());

        return {
          index: b.index,
          timestamp: b.timestamp,
          sender: b.sender
            ? isParticipant
              ? { name: b.sender.name, email: b.sender.email }
              : { name: 'Hidden User', email: 'hidden@trustique.local' }
            : null,
          receiver: b.receiver
            ? isParticipant
              ? { name: b.receiver.name, email: b.receiver.email }
              : { name: 'Hidden User', email: 'hidden@trustique.local' }
            : null,
          messageHash: b.messageHash,
          previousHash: b.previousHash,
          hash: b.hash,
          nonce: b.nonce,
        };
      }),
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=trustique-blockchain.json');
    res.json(exportData);
  } catch (error) {
    console.error('Export blockchain error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting blockchain.',
    });
  }
};

module.exports = { getBlockchain, validateBlockchain, exportBlockchain };
