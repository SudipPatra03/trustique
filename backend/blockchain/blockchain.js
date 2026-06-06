/**
 * Custom Blockchain Implementation
 * Each block contains a message hash and is linked to the previous block
 * via SHA-256 hashing, forming an immutable chain for message verification
 */

const crypto = require('crypto');
const BlockModel = require('../models/Block');

class Block {
  /**
   * Create a new block
   * @param {number} index - Block position in the chain
   * @param {Date} timestamp - Block creation time
   * @param {string} sender - Sender user ID
   * @param {string} receiver - Receiver user ID
   * @param {string} messageHash - SHA-256 hash of the original plaintext message
   * @param {string} previousHash - Hash of the previous block
   */
  constructor(index, timestamp, sender, receiver, messageHash, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.sender = sender;
    this.receiver = receiver;
    this.messageHash = messageHash;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  /**
   * Calculate SHA-256 hash of this block's data
   * Combines all block fields into a deterministic hash
   */
  calculateHash() {
    const data = 
      this.index +
      this.previousHash +
      this.timestamp.toISOString() +
      this.sender +
      this.receiver +
      this.messageHash +
      this.nonce;

    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

class Blockchain {
  /**
   * Create or load the genesis block
   * The genesis block is the first block in the chain with index 0
   */
  static async createGenesisBlock() {
    const existingGenesis = await BlockModel.findOne({ index: 0 });
    if (existingGenesis) return;

    const genesisBlock = new Block(
      0,
      new Date(),
      '000000000000000000000000', // placeholder sender
      '000000000000000000000000', // placeholder receiver
      'genesis-block',
      '0'
    );

    await BlockModel.create({
      index: genesisBlock.index,
      timestamp: genesisBlock.timestamp,
      sender: undefined, // Genesis block has no real sender
      receiver: undefined, // Genesis block has no real receiver
      messageHash: genesisBlock.messageHash,
      previousHash: genesisBlock.previousHash,
      hash: genesisBlock.hash,
      nonce: genesisBlock.nonce,
    });

    console.log('🔗 Genesis block created');
  }

  /**
   * Get the latest block in the chain
   * @returns {Object} - The most recent block document
   */
  static async getLatestBlock() {
    return await BlockModel.findOne().sort({ index: -1 });
  }

  /**
   * Add a new block to the chain
   * @param {string} sender - Sender user ID
   * @param {string} receiver - Receiver user ID
   * @param {string} messageHash - SHA-256 hash of the plaintext message
   * @returns {Object} - The newly created block document
   */
  static async addBlock(sender, receiver, messageHash) {
    const latestBlock = await this.getLatestBlock();
    const newIndex = latestBlock ? latestBlock.index + 1 : 1;
    const previousHash = latestBlock ? latestBlock.hash : '0';

    const newBlock = new Block(
      newIndex,
      new Date(),
      sender.toString(),
      receiver.toString(),
      messageHash,
      previousHash
    );

    const savedBlock = await BlockModel.create({
      index: newBlock.index,
      timestamp: newBlock.timestamp,
      sender: sender,
      receiver: receiver,
      messageHash: newBlock.messageHash,
      previousHash: newBlock.previousHash,
      hash: newBlock.hash,
      nonce: newBlock.nonce,
    });

    return savedBlock;
  }

  /**
   * Validate the integrity of the entire blockchain
   * Checks that each block's hash is correct and links to the previous block
   * @returns {{ valid: boolean, invalidBlockIndex?: number }}
   */
  static async validateChain() {
    const blocks = await BlockModel.find().sort({ index: 1 });

    if (blocks.length <= 1) return { valid: true };

    for (let i = 1; i < blocks.length; i++) {
      const currentBlock = blocks[i];
      const previousBlock = blocks[i - 1];

      // Recalculate the current block's hash
      const recalculated = new Block(
        currentBlock.index,
        currentBlock.timestamp,
        currentBlock.sender ? currentBlock.sender.toString() : '000000000000000000000000',
        currentBlock.receiver ? currentBlock.receiver.toString() : '000000000000000000000000',
        currentBlock.messageHash,
        currentBlock.previousHash
      );

      // Check if stored hash matches recalculated hash
      if (currentBlock.hash !== recalculated.hash) {
        return { valid: false, invalidBlockIndex: currentBlock.index };
      }

      // Check if previousHash matches the actual previous block's hash
      if (currentBlock.previousHash !== previousBlock.hash) {
        return { valid: false, invalidBlockIndex: currentBlock.index };
      }
    }

    return { valid: true };
  }
}

module.exports = { Block, Blockchain };
