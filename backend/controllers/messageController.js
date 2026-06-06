/**
 * Message Controller
 * Handles sending encrypted messages, fetching chat history,
 * verifying message integrity against blockchain, and read receipts
 */

const Message = require('../models/Message');
const FriendRequest = require('../models/FriendRequest');
const { encrypt, decrypt, hashSHA256, safeDecrypt } = require('../utils/encryption');
const { Blockchain } = require('../blockchain/blockchain');

const DEFAULT_MESSAGE_LIMIT = 100;

/**
 * Send a message
 * POST /api/messages/send
 * Body: { receiver, content }
 * 
 * Flow:
 * 1. Hash the plaintext with SHA-256
 * 2. Encrypt the plaintext with AES-256-CBC
 * 3. Store encrypted message + IV + hash in MongoDB
 * 4. Add a new block to the blockchain with the message hash
 */
const sendMessage = async (req, res) => {
  try {
    const { receiver, content } = req.body;
    const sender = req.user._id;

    if (!receiver || !content) {
      return res.status(400).json({
        success: false,
        message: 'Receiver and message content are required.',
      });
    }

    // Validate receiver is a valid MongoDB ObjectId
    if (typeof receiver !== 'string' || receiver.length !== 24 || !/^[0-9a-f]{24}$/.test(receiver)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receiver ID format.',
      });
    }

    // Prevent sending messages to oneself
    if (sender.toString() === receiver) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send messages to yourself.',
      });
    }

    // Validate content is not too large (max 5000 characters)
    if (typeof content !== 'string' || content.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message content must be a string and no more than 5000 characters.',
      });
    }

    // Check if users are friends before allowing message
    const friendship = await FriendRequest.findOne({
      $or: [
        { sender: sender, receiver: receiver, status: 'accepted' },
        { sender: receiver, receiver: sender, status: 'accepted' },
      ],
    });

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'You must be friends to send messages. Send a friend request first.',
      });
    }

    // Step 1: Hash the plaintext for blockchain verification
    const messageHash = hashSHA256(content);

    // Step 2: Encrypt the message with AES-256-CBC
    const { encryptedData, iv } = encrypt(content);

    // Check if receiver is online
    const { onlineUsers } = require('../sockets/socketHandler');
    const isReceiverOnline = onlineUsers && onlineUsers.has(receiver.toString());

    // Step 3: Store encrypted message in MongoDB
    const message = await Message.create({
      sender,
      receiver,
      encryptedMessage: encryptedData,
      iv,
      messageHash,
      delivered: isReceiverOnline || false,
    });

    // Step 4: Add block to blockchain
    const block = await Blockchain.addBlock(sender, receiver, messageHash);

    // Populate sender info for the response
    await message.populate('sender', 'name nameAbbreviation profilePhoto');
    await message.populate('receiver', 'name nameAbbreviation profilePhoto');

    res.status(201).json({
      success: true,
      message: {
        _id: message._id,
        sender: message.sender ? { 
          _id: message.sender._id, 
          name: safeDecrypt(message.sender.name, message.sender.nameAbbreviation),
          nameAbbreviation: message.sender.nameAbbreviation,
          profilePhoto: message.sender.profilePhoto || ''
        } : null,
        receiver: message.receiver ? { 
          _id: message.receiver._id, 
          name: safeDecrypt(message.receiver.name, message.receiver.nameAbbreviation),
          nameAbbreviation: message.receiver.nameAbbreviation,
          profilePhoto: message.receiver.profilePhoto || ''
        } : null,
        content, // Send plaintext back to the sender
        messageHash: message.messageHash,
        read: message.read,
        delivered: message.delivered,
        timestamp: message.timestamp,
      },
      block: {
        index: block.index,
        hash: block.hash,
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending message.',
    });
  }
};

/**
 * Get chat history between authenticated user and another user
 * GET /api/messages/:userId
 * Messages are decrypted before being sent to the client
 */
const getMessages = async (req, res) => {
  try {
    const currentUser = req.user._id;
    const otherUser = req.params.userId;

    // Validate otherUser is a valid MongoDB ObjectId
    if (!otherUser || otherUser.length !== 24 || !/^[0-9a-f]{24}$/.test(otherUser)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    // Find all messages between the two users
        const maxMessages = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_MESSAGE_LIMIT, 1), 500);
    const messages = await Message.find({
      $or: [
        { sender: currentUser, receiver: otherUser },
        { sender: otherUser, receiver: currentUser },
      ],
    })
      .populate('sender', 'name nameAbbreviation profilePhoto')
      .populate('receiver', 'name nameAbbreviation profilePhoto')
      .sort({ timestamp: -1 })
      .limit(maxMessages)
      .lean();

    // Reverse to maintain chronological order after limiting
    messages.reverse();

    // Decrypt each message for the client
    const decryptedMessages = messages.map((msg) => {
      let content;
      try {
        content = decrypt(msg.encryptedMessage, msg.iv);
      } catch (err) {
        content = '[Unable to decrypt message]';
      }

      return {
        _id: msg._id,
        sender: msg.sender ? { 
          _id: msg.sender._id, 
          name: safeDecrypt(msg.sender.name, msg.sender.nameAbbreviation),
          nameAbbreviation: msg.sender.nameAbbreviation,
          profilePhoto: msg.sender.profilePhoto || ''
        } : null,
        receiver: msg.receiver ? { 
          _id: msg.receiver._id, 
          name: safeDecrypt(msg.receiver.name, msg.receiver.nameAbbreviation),
          nameAbbreviation: msg.receiver.nameAbbreviation,
          profilePhoto: msg.receiver.profilePhoto || ''
        } : null,
        content,
        messageHash: msg.messageHash,
        read: msg.read,
        delivered: msg.delivered,
        timestamp: msg.timestamp,
      };
    });

    res.json({
      success: true,
      messages: decryptedMessages,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching messages.',
    });
  }
};

/**
 * Verify a message's integrity against the blockchain
 * POST /api/messages/verify/:messageId
 * 
 * Flow:
 * 1. Fetch the encrypted message from MongoDB
 * 2. Decrypt it to get the plaintext
 * 3. Re-compute SHA-256 hash of the plaintext
 * 4. Find the corresponding block in the blockchain
 * 5. Compare the computed hash with the stored hash
 */
const verifyMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate messageId is a valid MongoDB ObjectId
    if (!messageId || messageId.length !== 24 || !/^[0-9a-f]{24}$/.test(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID format.',
      });
    }

    // Fetch the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found.',
      });
    }

    // Decrypt the message
    let decryptedContent;
    try {
      decryptedContent = decrypt(message.encryptedMessage, message.iv);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to decrypt message.',
        verified: false,
      });
    }

    // Re-compute SHA-256 hash
    const computedHash = hashSHA256(decryptedContent);

    // Compare with stored message hash
    const hashMatch = computedHash === message.messageHash;

    // Find the corresponding block in the blockchain
    const block = await require('../models/Block').findOne({
      messageHash: message.messageHash,
    });

    let blockchainMatch = false;
    if (block) {
      blockchainMatch = block.messageHash === computedHash;
    }

    // Message is verified only if both hashes match
    const verified = hashMatch && blockchainMatch;

    res.json({
      success: true,
      verified,
      details: {
        computedHash,
        storedHash: message.messageHash,
        blockchainHash: block ? block.messageHash : null,
        blockIndex: block ? block.index : null,
        hashMatch,
        blockchainMatch,
        blockFound: !!block,
      },
    });
  } catch (error) {
    console.error('Verify message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying message.',
    });
  }
};

/**
 * Mark a message as read
 * PATCH /api/messages/read/:messageId
 */
const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate messageId is a valid MongoDB ObjectId
    if (!messageId || messageId.length !== 24 || !/^[0-9a-f]{24}$/.test(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID format.',
      });
    }

    const message = await Message.findByIdAndUpdate(
      messageId,
      { read: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found.',
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read.',
      messageId: message._id,
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error marking message as read.',
    });
  }
};

/**
 * Upload a file
 * POST /api/messages/upload
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded.',
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading file.',
    });
  }
};

/**
 * Get unread message counts grouped by sender
 * GET /api/messages/unread-counts
 * Returns: { counts: { senderId: number, ... } }
 */
const getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user._id;

    const results = await Message.aggregate([
      { $match: { receiver: userId, read: false } },
      { $group: { _id: '$sender', count: { $sum: 1 } } },
    ]);

    const counts = {};
    results.forEach(r => {
      counts[r._id.toString()] = r.count;
    });

    res.json({ success: true, counts });
  } catch (error) {
    console.error('Get unread counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching unread counts.',
    });
  }
};

module.exports = { sendMessage, getMessages, verifyMessage, markAsRead, uploadFile, getUnreadCounts };
