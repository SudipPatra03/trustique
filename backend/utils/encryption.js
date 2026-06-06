/**
 * Encryption Utilities
 * Provides AES-256-CBC encryption/decryption and SHA-256 hashing
 * Used for message encryption and blockchain hash generation
 */

const crypto = require('crypto');

// AES-256-CBC requires a 32-byte key (64 hex characters)
const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.AES_SECRET_KEY, 'hex');

/**
 * Encrypt plaintext using AES-256-CBC
 * @param {string} text - The plaintext message to encrypt
 * @returns {{ encryptedData: string, iv: string }} - Encrypted data and initialization vector
 */
function encrypt(text) {
  // Generate a random 16-byte initialization vector for each message
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt ciphertext using AES-256-CBC
 * @param {string} encryptedData - The hex-encoded ciphertext
 * @param {string} ivHex - The hex-encoded initialization vector
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedData, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate SHA-256 hash of a string
 * @param {string} data - The string to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function hashSHA256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = { encrypt, decrypt, hashSHA256 };
