/**
 * Socket.IO Event Handlers
 * Manages real-time communication: user presence, messaging, typing indicators, read receipts
 */

const User = require('../models/User');
const Message = require('../models/Message');

// Map userId → Set of socketIds for routing messages to specific connected clients
const onlineUsers = new Map();
let ioInstance;

/**
 * Initialize Socket.IO event handlers
 * @param {import('socket.io').Server} io - Socket.IO server instance
 */
function initializeSocketHandlers(io) {
  ioInstance = io;
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    /**
     * User comes online
     * Registers the user's socket and broadcasts their online status
     */
    socket.on('user:online', async (userId) => {
      if (!userId) return;

      socket.userId = userId;

      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
        // Update database
        try {
          await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
          await Message.updateMany({ receiver: userId, delivered: false }, { delivered: true });
          io.emit('messages:delivered', { userId });
        } catch (err) {
          console.error('Error updating online status:', err);
        }
        // Broadcast to all clients
        io.emit('user:status', { userId, isOnline: true });
      }

      onlineUsers.get(userId).add(socket.id);

      // Send the list of currently online users to the newly connected user
      const onlineUserIds = Array.from(onlineUsers.keys());
      socket.emit('user:onlineList', onlineUserIds);

      console.log(`👤 User online: ${userId} (${onlineUsers.size} total users online)`);
    });

    /**
     * Send a message in real-time
     * Relays the message to the receiver if they are online
     */
    socket.on('message:send', (data) => {
      const { receiver } = data;
      // Resolve receiver ID — may be a string or a populated user object
      const receiverId = (receiver && typeof receiver === 'object') ? receiver._id : receiver;
      const receiverSockets = onlineUsers.get(receiverId);

      if (receiverSockets) {
        receiverSockets.forEach(socketId => {
          io.to(socketId).emit('message:receive', data);
        });
      }
    });

    /**
     * Read receipt
     * Notifies the sender that their message has been read
     */
    socket.on('message:read', (data) => {
      const { messageId, sender } = data;
      const senderSockets = onlineUsers.get(sender);

      if (senderSockets) {
        senderSockets.forEach(socketId => {
          io.to(socketId).emit('message:read:ack', { messageId });
        });
      }
    });

    /**
     * Typing indicator - start
     */
    socket.on('typing:start', (data) => {
      const { sender, receiver } = data;
      const receiverSockets = onlineUsers.get(receiver);

      if (receiverSockets) {
        receiverSockets.forEach(socketId => {
          io.to(socketId).emit('typing:display', {
            userId: sender,
            isTyping: true,
          });
        });
      }
    });

    /**
     * Typing indicator - stop
     */
    socket.on('typing:stop', (data) => {
      const { sender, receiver } = data;
      const receiverSockets = onlineUsers.get(receiver);

      if (receiverSockets) {
        receiverSockets.forEach(socketId => {
          io.to(socketId).emit('typing:display', {
            userId: sender,
            isTyping: false,
          });
        });
      }
    });

    /**
     * Friend request notification
     * Relays friend request to the receiver in real-time
     */
    socket.on('friend:request', (data) => {
      const { to, from } = data;
      const receiverSockets = onlineUsers.get(to);

      if (receiverSockets) {
        receiverSockets.forEach(socketId => {
          io.to(socketId).emit('friend:request:received', { from });
        });
      }
    });

    /**
     * User disconnects
     * Updates their status to offline and broadcasts
     */
    socket.on('disconnect', async () => {
      const userId = socket.userId;

      if (userId && onlineUsers.has(userId)) {
        const userSockets = onlineUsers.get(userId);
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          // Update database
          try {
            await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
          } catch (err) {
            console.error('Error updating offline status:', err);
          }

          // Broadcast offline status
          io.emit('user:status', { userId, isOnline: false });

          console.log(`👤 User offline: ${userId} (${onlineUsers.size} total users online)`);
        }
      }

      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

function getIo() {
  return ioInstance;
}

module.exports = { initializeSocketHandlers, onlineUsers, getIo };
