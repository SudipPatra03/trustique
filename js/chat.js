/**
 * Chat Module — Real-time messaging with Socket.IO
 * Handles message sending/receiving, verification, typing indicators, and read receipts
 */

const ChatApp = (function () {
  const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : 'https://trustique-wl6m.onrender.com';
  const API_BASE = BACKEND_URL + '/api';
  let socket = null;
  let currentUser = null;
  let selectedUser = null;
  let typingTimeout = null;
  let isTyping = false;
  const onlineUsers = new Set();
  const unreadCounts = {}; // { userId: count }
  const friendsSet = new Set(); // track accepted friend IDs

  // SVG icon constants
  const SVG_FOLDER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
  const SVG_FILE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
  const SVG_SHIELD_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';
  const SVG_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // Redirect to login if token is invalid/expired
  function handleAuthError(res) {
    if (res.status === 401) {
      toast('Session expired. Redirecting to login...', 'error');
      localStorage.removeItem('sc-token');
      localStorage.removeItem('sc-user');
      setTimeout(() => { window.location.href = 'index.html'; }, 1000);
      return true;
    }
    return false;
  }

  function getToken() { return localStorage.getItem('sc-token'); }
  function getUser() { return JSON.parse(localStorage.getItem('sc-user') || 'null'); }

  function headers() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
  }

  // Toast notification
  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
  }

  // Initialize socket connection
  function initSocket() {
    currentUser = getUser();
    if (!currentUser) { window.location.href = 'index.html'; return; }

    socket = io(BACKEND_URL);

    socket.on('connect', () => {
      socket.emit('user:online', currentUser._id);
    });

    // Receive messages
    socket.on('message:receive', (data) => {
      if (selectedUser && data.sender && data.sender._id === selectedUser._id) {
        appendMessage(data, 'received');
        scrollToBottom();
        // Mark as read
        markAsRead(data._id, data.sender._id);
      } else {
        // Increment unread count badge for this sender
        const senderId = data.sender ? data.sender._id : null;
        if (senderId) {
          unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
          updateUnreadBadge(senderId);
        }
        const senderName = data.sender ? data.sender.name : 'Someone';
        toast(`New message from ${senderName}`, 'info');
      }
    });

    // User status updates
    socket.on('user:status', (data) => {
      if (data.isOnline) {
        onlineUsers.add(data.userId);
      } else {
        onlineUsers.delete(data.userId);
      }
      updateUserStatus(data.userId, data.isOnline);
    });

    // Online users list
    socket.on('user:onlineList', (userIds) => {
      onlineUsers.clear();
      userIds.forEach(id => {
        onlineUsers.add(id);
        updateUserStatus(id, true);
      });
    });

    // Read receipt acknowledgement
    socket.on('message:read:ack', (data) => {
      const tickEl = document.querySelector(`[data-msg-id="${data.messageId}"] .message-ticks`);
      if (tickEl) { tickEl.textContent = '✓✓'; tickEl.classList.add('read'); }
    });

    // Messages delivered acknowledgement
    socket.on('messages:delivered', (data) => {
      if (selectedUser && data.userId === selectedUser._id) {
        const ticksList = document.querySelectorAll('.message-wrapper.sent .message-ticks');
        ticksList.forEach(tick => {
          if (tick.textContent === '✓') {
            tick.textContent = '✓✓';
          }
        });
      }
    });

    // Typing indicator
    socket.on('typing:display', (data) => {
      if (selectedUser && data.userId === selectedUser._id) {
        const indicator = document.getElementById('typingIndicator');
        if (data.isTyping) {
          indicator.classList.add('show');
        } else {
          indicator.classList.remove('show');
        }
        // Also update header
        const statusEl = document.getElementById('chatUserStatus');
        if (data.isTyping) {
          statusEl.innerHTML = '<span class="typing-status">typing...</span>';
        } else {
          const isOnline = selectedUser.isOnline;
          statusEl.innerHTML = isOnline
            ? '<span class="online-status">online</span>'
            : '<span class="offline-status">offline</span>';
        }
      }
    });

    // Friend request received notification
    socket.on('friend:request:received', (data) => {
      const fromName = data.from ? data.from.name : 'Someone';
      toast(`${fromName} sent you a friend request`, 'info');
      // Update badge count
      const badge = document.getElementById('friendRequestCount');
      if (badge) {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
        badge.style.display = 'flex';
      }
    });

    socket.on('friend:request:accepted', (data) => {
      const fromName = data.name || 'Someone';
      toast(`${fromName} accepted your friend request!`, 'success');
      friendsSet.add(data.from);
      if (window.refreshDashboard) window.refreshDashboard();
    });

    socket.on('friend:request:rejected', (data) => {
      const fromName = data.name || 'Someone';
      toast(`${fromName} declined your friend request.`, 'info');
      if (window.refreshDashboard) window.refreshDashboard();
    });

    socket.on('friend:unfriended', (data) => {
      const fromName = data.name || 'Someone';
      toast(`${fromName} removed you from their friends list.`, 'info');
      friendsSet.delete(data.from);
      if (window.refreshDashboard) window.refreshDashboard();
      if (selectedUser && selectedUser._id === data.from) {
        openChat(selectedUser);
      }
    });
  }

  // Update online/offline status in user list
  function updateUserStatus(userId, isOnline) {
    const item = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (item) {
      const dot = item.querySelector('.status-dot');
      const statusText = item.querySelector('.status-text');
      if (dot) { dot.className = isOnline ? 'status-dot online' : 'status-dot'; }
      if (statusText) {
        const isFriend = friendsSet.has(userId);
        statusText.textContent = isFriend ? (isOnline ? 'Online' : 'Offline') : 'Not a friend';
        statusText.className = isOnline ? 'status-text online' : 'status-text';
      }
    }
    // Update chat header if this user is selected
    if (selectedUser && selectedUser._id === userId) {
      selectedUser.isOnline = isOnline;
      const chatDot = document.getElementById('chatStatusDot');
      const chatStatus = document.getElementById('chatUserStatus');
      if (chatDot) chatDot.className = isOnline ? 'status-dot online' : 'status-dot';
      if (chatStatus && !chatStatus.querySelector('.typing-status')) {
        chatStatus.innerHTML = isOnline
          ? '<span class="online-status">online</span>'
          : '<span class="offline-status">offline</span>';
      }
    }
  }

  // Open chat with a user
  async function openChat(user) {
    selectedUser = user;
    const isOnline = isUserOnline(user._id);
    selectedUser.isOnline = isOnline;

    // Update UI
    document.getElementById('chatPlaceholder').style.display = 'none';
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('messagesContainer').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'block';

    // Set header info
    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.innerHTML = `<span id="chatAvatarLetter">${user.name.charAt(0).toUpperCase()}</span><div class="status-dot ${isOnline ? 'online' : ''}" id="chatStatusDot"></div>`;
    document.getElementById('chatUserName').textContent = user.name;
    const chatDot = document.getElementById('chatStatusDot');
    if (chatDot) chatDot.className = isOnline ? 'status-dot online' : 'status-dot';
    const chatStatus = document.getElementById('chatUserStatus');
    chatStatus.innerHTML = isOnline
      ? '<span class="online-status">online</span>'
      : '<span class="offline-status">offline</span>';

    // Highlight active user in list
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.user-item[data-user-id="${user._id}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Mobile: show chat area
    document.getElementById('chatArea').classList.add('active');
    document.getElementById('sidebar').classList.add('hidden');

    // Check friendship status before loading chat
    const isFriend = await checkFriendshipStatus(user._id);
    if (!isFriend) {
      // Not friends — show friend request prompt instead of chat
      const unfriendBtn = document.getElementById('unfriendBtn');
      if (unfriendBtn) unfriendBtn.style.display = 'none';
      document.getElementById('chatInputArea').style.display = 'none';
      const container = document.getElementById('messagesContainer');
      container.innerHTML = `
        <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:1rem;opacity:0.4;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
          <p style="font-size:1rem;margin-bottom:1rem;">You must be friends to chat with <strong>${user.name}</strong></p>
          <button class="btn btn-primary friend-request-action-btn" onclick="ChatApp.sendFriendRequestTo('${user._id}')" style="padding:0.6rem 1.5rem;font-size:0.9rem;">Send Friend Request</button>
        </div>
      `;
      // Focus input (no-op but safe)
      return;
    }

    // Load messages
    await loadMessages(user._id);

    // Show unfriend button
    const unfriendBtn = document.getElementById('unfriendBtn');
    if (unfriendBtn) unfriendBtn.style.display = 'block';

    // Clear unread badge for this user
    clearUnreadCount(user._id);

    // Focus input
    document.getElementById('messageInput').focus();
  }

  // Load message history
  async function loadMessages(userId) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)"><span class="spinner" style="border-color:var(--border);border-top-color:var(--accent)"></span></div>';

    try {
      const res = await fetch(`${API_BASE}/messages/${userId}`, { headers: headers() });
      if (handleAuthError(res)) return;
      const data = await res.json();

      container.innerHTML = '';

      if (data.success && data.messages.length > 0) {
        let lastDate = '';
        data.messages.forEach(msg => {
          // Date separator
          const msgDate = new Date(msg.timestamp).toLocaleDateString();
          if (msgDate !== lastDate) {
            lastDate = msgDate;
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.innerHTML = `<span>${formatDate(msg.timestamp)}</span>`;
            container.appendChild(sep);
          }

          const isSent = msg.sender._id === currentUser._id;
          appendMessage(msg, isSent ? 'sent' : 'received');

          // Mark loaded received message as read if unread
          if (!isSent && !msg.read) {
            markAsRead(msg._id, msg.sender._id);
          }
        });
        scrollToBottom();
      } else {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.9rem;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.5rem;opacity:0.5;"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg><br>No messages yet. Start the conversation!</div>';
      }
    } catch (err) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--danger);">Failed to load messages.</div>';
    }
  }

  // Append a message bubble
  function appendMessage(msg, type) {
    const container = document.getElementById('messagesContainer');
    // Remove "no messages" placeholder
    const placeholder = container.querySelector('div[style*="No messages"]');
    if (placeholder) placeholder.remove();

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${type}`;
    wrapper.setAttribute('data-msg-id', msg._id);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Check if the decrypted message is an attachment
    let isAttachment = false;
    let attachment = null;
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed && parsed.isAttachment) {
        isAttachment = true;
        attachment = parsed;
      }
    } catch (e) {}

    if (isAttachment) {
      bubble.classList.add('attachment-bubble');
      if (attachment.fileType && attachment.fileType.startsWith('image/')) {
        // Render picture/photo inline
        const img = document.createElement('img');
        img.src = attachment.fileUrl;
        img.className = 'image-attachment';
        img.alt = attachment.fileName;
        img.onclick = () => window.open(attachment.fileUrl, '_blank');
        bubble.appendChild(img);
      } else {
        // Render general file/zipped folder download block
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-attachment';

        const isFolder = attachment.fileType === 'application/zip' && attachment.fileName.endsWith('.zip');
        const icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.innerHTML = isFolder ? SVG_FOLDER : SVG_FILE;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'file-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = attachment.fileName;
        infoDiv.appendChild(nameSpan);

        const actionLink = document.createElement('a');
        actionLink.href = attachment.fileUrl;
        actionLink.download = attachment.fileName;
        actionLink.className = 'file-download-btn';
        actionLink.textContent = 'Download';

        fileDiv.appendChild(icon);
        fileDiv.appendChild(infoDiv);
        fileDiv.appendChild(actionLink);

        bubble.appendChild(fileDiv);
      }
    } else {
      bubble.textContent = msg.content;
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(msg.timestamp);
    meta.appendChild(time);

    if (type === 'sent') {
      const ticks = document.createElement('span');
      if (msg.read) {
        ticks.className = 'message-ticks read';
        ticks.textContent = '✓✓';
      } else if (msg.delivered) {
        ticks.className = 'message-ticks';
        ticks.textContent = '✓✓';
      } else {
        ticks.className = 'message-ticks';
        ticks.textContent = '✓';
      }
      meta.appendChild(ticks);
    }

    bubble.appendChild(meta);
    wrapper.appendChild(bubble);

    container.appendChild(wrapper);
  }

  // Send a message
  async function sendMessage(overrideContent = null) {
    const input = document.getElementById('messageInput');
    // Ensure overrideContent is a string and not a Event/PointerEvent from standard click listeners
    const isOverrideString = typeof overrideContent === 'string';
    const content = isOverrideString ? overrideContent : input.value.trim();
    if (!content || !selectedUser) return;

    if (!isOverrideString) {
      input.value = '';
    }
    stopTyping();

    try {
      const res = await fetch(`${API_BASE}/messages/send`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ receiver: selectedUser._id, content }),
      });
      if (handleAuthError(res)) return;
      const data = await res.json();

      if (data.success) {
        appendMessage(data.message, 'sent');
        scrollToBottom();

        // Emit via socket for real-time delivery
        socket.emit('message:send', {
          ...data.message,
          sender: currentUser,
          receiver: selectedUser,
        });
      } else {
        toast(data.message || 'Failed to send message.', 'error');
      }
    } catch (err) {
      toast('Network error. Message not sent.', 'error');
    }
  }

  // Verify a message against the blockchain
  async function verifyMessage(messageId, wrapper) {
    const existing = wrapper.querySelector('.verify-badge, .verify-btn');
    if (existing && existing.classList.contains('verify-badge')) return; // Already verified

    const btn = wrapper.querySelector('.verify-btn');
    if (btn) { btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;border-color:var(--border);border-top-color:var(--accent)"></span> Verifying...'; btn.disabled = true; }

    try {
      const res = await fetch(`${API_BASE}/messages/verify/${messageId}`, {
        method: 'POST',
        headers: headers(),
      });
      const data = await res.json();

      // Remove verify button
      if (btn) btn.remove();

      const badge = document.createElement('span');
      if (data.verified) {
        badge.className = 'verify-badge verified';
        badge.innerHTML = SVG_SHIELD_CHECK + ' Verified';
      } else {
        badge.className = 'verify-badge tampered';
        badge.innerHTML = '⚠️ Tampered ✗';
      }
      wrapper.appendChild(badge);
    } catch (err) {
      if (btn) { btn.innerHTML = SVG_LOCK + ' Verify'; btn.disabled = false; }
      toast('Verification failed.', 'error');
    }
  }

  // Mark message as read
  async function markAsRead(messageId, senderId) {
    try {
      await fetch(`${API_BASE}/messages/read/${messageId}`, { method: 'PATCH', headers: headers() });
      socket.emit('message:read', { messageId, sender: senderId });
    } catch (err) { /* silent fail */ }
  }

  // Typing indicator handlers
  function startTyping() {
    if (!isTyping && selectedUser) {
      isTyping = true;
      socket.emit('typing:start', { sender: currentUser._id, receiver: selectedUser._id });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2000);
  }

  function stopTyping() {
    if (isTyping && selectedUser) {
      isTyping = false;
      socket.emit('typing:stop', { sender: currentUser._id, receiver: selectedUser._id });
    }
  }



  // Utility: format time
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Utility: format date
  function formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
  }

  function isUserOnline(userId) {
    return onlineUsers.has(userId);
  }

  // Upload and send a file attachment
  async function uploadAndSendAttachment(file, type) {
    if (!selectedUser) return;
    toast(`Uploading ${type}...`, 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/messages/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        // Construct E2E encrypted message payload with attachment details
        const attachmentContent = JSON.stringify({
          isAttachment: true,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileType: data.fileType
        });
        
        await sendMessage(attachmentContent);
        toast(`${type.charAt(0).toUpperCase() + type.slice(1)} sent!`, 'success');
      } else {
        toast(data.message || 'Upload failed.', 'error');
      }
    } catch (err) {
      console.error('Upload attachment error:', err);
      toast('Network error uploading file.', 'error');
    }
  }

  // Zips a folder client-side and uploads it
  async function uploadAndSendFolder(files) {
    if (!selectedUser || files.length === 0) return;
    
    // Extract folder name from webkitRelativePath
    let folderName = 'Folder';
    const firstPath = files[0].webkitRelativePath;
    if (firstPath) {
      const parts = firstPath.split('/');
      if (parts.length > 0) {
        folderName = parts[0];
      }
    }
    
    toast(`Zipping folder "${folderName}"...`, 'info');
    
    try {
      const zip = new JSZip();
      for (const file of files) {
        zip.file(file.webkitRelativePath || file.name, file);
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zippedFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });
      
      await uploadAndSendAttachment(zippedFile, 'folder');
    } catch (err) {
      console.error('Zipping folder error:', err);
      toast('Failed to zip folder.', 'error');
    }
  }

  // Fetch unread message counts from the server and update badges
  async function fetchUnreadCounts() {
    try {
      const res = await fetch(`${API_BASE}/messages/unread-counts`, { headers: headers() });
      if (handleAuthError(res)) return;
      const data = await res.json();
      if (data.success) {
        Object.keys(data.counts).forEach(senderId => {
          unreadCounts[senderId] = data.counts[senderId];
          updateUnreadBadge(senderId);
        });
      }
    } catch (err) {
      console.error('Fetch unread counts error:', err);
    }
  }

  // Update the unread badge on a user list item
  function updateUnreadBadge(userId) {
    const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (!userItem) return;

    let badge = userItem.querySelector('.unread-badge');
    const count = unreadCounts[userId] || 0;

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        userItem.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      if (badge) badge.remove();
    }
  }

  // Clear unread count for a specific user
  function clearUnreadCount(userId) {
    delete unreadCounts[userId];
    updateUnreadBadge(userId);
  }

  // ---- Friendship functions ----

  // Check if current user is friends with given userId
  async function checkFriendshipStatus(userId) {
    if (friendsSet.has(userId)) return true;
    try {
      const res = await fetch(`${API_BASE}/friends/status/${userId}`, { headers: headers() });
      if (handleAuthError(res)) return false;
      const data = await res.json();
      if (data.success && data.status === 'accepted') {
        friendsSet.add(userId);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  // Send a friend request to a user
  async function sendFriendRequestTo(userId) {
    try {
      const res = await fetch(`${API_BASE}/friends/request`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ receiverId: userId }),
      });
      if (handleAuthError(res)) return;
      const data = await res.json();
      if (data.success) {
        toast('Friend request sent!', 'success');
        // Emit socket event for real-time notification
        if (socket) {
          socket.emit('friend:request', { to: userId, from: currentUser });
        }
      } else {
        toast(data.message || 'Failed to send request.', 'error');
      }
    } catch (err) {
      toast('Network error.', 'error');
    }
  }

  // Load pending friend requests
  async function loadFriendRequests() {
    try {
      const res = await fetch(`${API_BASE}/friends/requests`, { headers: headers() });
      if (handleAuthError(res)) return [];
      const data = await res.json();
      return data.success ? data.requests : [];
    } catch (err) {
      return [];
    }
  }

  // Accept a friend request
  async function acceptFriendRequestById(requestId) {
    try {
      const res = await fetch(`${API_BASE}/friends/accept/${requestId}`, {
        method: 'PATCH',
        headers: headers(),
      });
      if (handleAuthError(res)) return false;
      const data = await res.json();
      if (data.success) {
        toast('Friend request accepted!', 'success');
        // Add to local friends set
        const friendId = data.request.sender._id;
        friendsSet.add(friendId);
        return true;
      } else {
        toast(data.message || 'Failed to accept.', 'error');
        return false;
      }
    } catch (err) {
      toast('Network error.', 'error');
      return false;
    }
  }

  // Reject a friend request
  async function rejectFriendRequestById(requestId) {
    try {
      const res = await fetch(`${API_BASE}/friends/reject/${requestId}`, {
        method: 'PATCH',
        headers: headers(),
      });
      if (handleAuthError(res)) return false;
      const data = await res.json();
      if (data.success) {
        toast('Friend request rejected.', 'info');
        return true;
      } else {
        toast(data.message || 'Failed to reject.', 'error');
        return false;
      }
    } catch (err) {
      toast('Network error.', 'error');
      return false;
    }
  }

  // Load the friends list and populate friendsSet
  async function loadFriends() {
    try {
      const res = await fetch(`${API_BASE}/friends`, { headers: headers() });
      if (handleAuthError(res)) return [];
      const data = await res.json();
      if (data.success) {
        data.friends.forEach(f => friendsSet.add(f._id));
        return data.friends;
      }
      return [];
    } catch (err) {
      return [];
    }
  }

  // Unfriend a user
  function unfriendUser(userId, userName) {
    const modal = document.getElementById('confirmModal');
    const nameEl = document.getElementById('confirmModalUserName');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');

    if (!modal || !nameEl || !cancelBtn || !confirmBtn) {
      if (!confirm(`Are you sure you want to unfriend ${userName}?`)) return;
      performUnfriend(userId);
      return;
    }

    nameEl.textContent = userName;
    modal.style.display = 'flex';

    // Clone and replace buttons to clear old event listeners
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newCancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    newConfirmBtn.addEventListener('click', async () => {
      modal.style.display = 'none';
      await performUnfriend(userId);
    });
  }

  async function performUnfriend(userId) {
    try {
      const res = await fetch(`${API_BASE}/friends/unfriend/${userId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (handleAuthError(res)) return;
      const data = await res.json();
      if (data.success) {
        toast('User unfriended successfully.', 'success');
        friendsSet.delete(userId);
        
        // Refresh dashboard (user status updates)
        if (window.refreshDashboard) {
          await window.refreshDashboard();
        }
        
        // If we are currently chatting with the unfriended user, refresh the chat UI
        if (selectedUser && selectedUser._id === userId) {
          openChat(selectedUser);
        }
      } else {
        toast(data.message || 'Failed to unfriend.', 'error');
      }
    } catch (err) {
      toast('Network error.', 'error');
    }
  }

  // Bind unfriend button click handler
  const unfriendBtnEl = document.getElementById('unfriendBtn');
  if (unfriendBtnEl) {
    unfriendBtnEl.addEventListener('click', () => {
      if (selectedUser) {
        unfriendUser(selectedUser._id, selectedUser.name);
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Public API
  return {
    initSocket, openChat, sendMessage, startTyping, toast,
    getToken, getUser, headers, isUserOnline,
    uploadAndSendAttachment, uploadAndSendFolder,
    fetchUnreadCounts, clearUnreadCount,
    checkFriendshipStatus, sendFriendRequestTo,
    loadFriendRequests, acceptFriendRequestById, rejectFriendRequestById,
    loadFriends, friendsSet
  };
})();
