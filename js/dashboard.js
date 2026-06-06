/**
 * Dashboard Module — User list, search, friend requests, event bindings
 * Initializes the app after login: loads users, sets up socket, binds UI events
 */

(function () {
  const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : 'https://trustique-wl6m.onrender.com';
  const API_BASE = BACKEND_URL + '/api';

  const SVG_USER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  // Auth guard
  const token = ChatApp.getToken();
  const user = ChatApp.getUser();
  if (!token || !user) { window.location.href = 'index.html'; return; }

  function getNameAbbreviation(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }

  // Set logged-in user's name in the header
  const currentUserDisplay = document.getElementById('currentUserDisplay');
  if (currentUserDisplay && user.name) {
    currentUserDisplay.innerHTML = `${SVG_USER} ${escapeHtml(user.name)}`;
  }

  // Initialize socket
  ChatApp.initSocket();

  // Load users and friends on page load
  async function initDashboard() {
    await ChatApp.loadFriends();
    await loadUsers();
    await loadAndShowFriendRequests();
  }
  initDashboard();

  // Export refresh function for chat.js socket events
  window.refreshDashboard = async function() {
    await ChatApp.loadFriends();
    loadUsers();
  };

  // ---- Event Bindings ----

  // Search
  const searchInput = document.getElementById('searchInput');
  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const query = searchInput.value.trim();
      if (query) {
        searchUsers(query);
      } else {
        loadUsers();
      }
    }, 300);
  });

  // Send message
  document.getElementById('sendBtn').addEventListener('click', ChatApp.sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { ChatApp.sendMessage(); }
  });

  // Typing indicator
  document.getElementById('messageInput').addEventListener('input', ChatApp.startTyping);

  // Back button (mobile)
  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('chatArea').classList.remove('active');
    document.getElementById('sidebar').classList.remove('hidden');
  });

  // Theme toggle is handled by theme.js

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('sc-token');
    localStorage.removeItem('sc-user');
    window.location.href = 'index.html';
  });

  // Friend Requests Panel toggle
  document.getElementById('friendRequestsBtn').addEventListener('click', () => {
    const panel = document.getElementById('friendRequestsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
      loadAndShowFriendRequests();
    }
  });
  document.getElementById('closeFriendPanel').addEventListener('click', () => {
    document.getElementById('friendRequestsPanel').style.display = 'none';
  });

  // Attachment popup toggle
  const attachTriggerBtn = document.getElementById('attachTriggerBtn');
  const attachmentPopup = document.getElementById('attachmentPopup');
  
  if (attachTriggerBtn && attachmentPopup) {
    attachTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      attachmentPopup.style.display = attachmentPopup.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      attachmentPopup.style.display = 'none';
    });

    attachmentPopup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Attachment button click handlers to trigger file selection
  document.getElementById('attachPhotoBtn').addEventListener('click', () => {
    attachmentPopup.style.display = 'none';
    document.getElementById('photoInput').click();
  });
  document.getElementById('attachFileBtn').addEventListener('click', () => {
    attachmentPopup.style.display = 'none';
    document.getElementById('fileInput').click();
  });
  document.getElementById('attachFolderBtn').addEventListener('click', () => {
    attachmentPopup.style.display = 'none';
    document.getElementById('folderInput').click();
  });

  // Attachment input change handlers
  document.getElementById('photoInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      ChatApp.uploadAndSendAttachment(e.target.files[0], 'photo');
      e.target.value = ''; // Reset input
    }
  });
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      ChatApp.uploadAndSendAttachment(e.target.files[0], 'file');
      e.target.value = ''; // Reset input
    }
  });
  document.getElementById('folderInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      ChatApp.uploadAndSendFolder(e.target.files);
      e.target.value = ''; // Reset input
    }
  });




  // ---- Functions ----

  async function loadUsers() {
    const userList = document.getElementById('userList');

    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: ChatApp.headers(),
      });
      const data = await res.json();

      if (data.success) {
        renderUserList(data.users);
        // Fetch unread counts after users are rendered so badges appear
        ChatApp.fetchUnreadCounts();
      } else {
        userList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Failed to load users.</div>';
      }
    } catch (err) {
      userList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--danger)">Network error.</div>';
    }
  }

  async function searchUsers(query) {
    const userList = document.getElementById('userList');

    try {
      const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(query)}`, {
        headers: ChatApp.headers(),
      });
      const data = await res.json();

      if (data.success) {
        renderUserList(data.users);
      }
    } catch (err) {
      // Silently fail, keep existing list
    }
  }

  function renderUserList(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    if (users.length === 0) {
      userList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.9rem;">No users found.</div>';
      return;
    }

    users.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'user-item';
      item.setAttribute('data-user-id', u._id);

      const initial = u.name.charAt(0).toUpperCase();
      const isOnline = ChatApp.isUserOnline(u._id);
      const isFriend = ChatApp.friendsSet.has(u._id);
      const statusClass = isOnline ? 'online' : '';
      const statusText = isFriend ? (isOnline ? 'Online' : 'Offline') : 'Not a friend';
      const statusTextClass = isOnline ? 'status-text online' : 'status-text';
      
      const avatarContent = `<span>${initial}</span>`;

      item.innerHTML = `
        <div class="user-avatar">
          ${avatarContent}
          <div class="status-dot ${statusClass}"></div>
        </div>
        <div class="user-info">
          <div class="name">${escapeHtml(u.name)}</div>
          <div class="${statusTextClass}">${statusText}</div>
        </div>
      `;

      item.addEventListener('click', () => ChatApp.openChat(u));
      userList.appendChild(item);
    });
  }

  // ---- Friend Request Panel ----

  async function loadAndShowFriendRequests() {
    const requests = await ChatApp.loadFriendRequests();
    const list = document.getElementById('friendRequestsList');
    const countBadge = document.getElementById('friendRequestCount');

    if (requests.length > 0) {
      countBadge.textContent = requests.length;
      countBadge.style.display = 'flex';
    } else {
      countBadge.style.display = 'none';
    }

    list.innerHTML = '';

    if (requests.length === 0) {
      list.innerHTML = '<div class="no-requests">No pending requests</div>';
      return;
    }

    requests.forEach((req) => {
      const item = document.createElement('div');
      item.className = 'friend-request-item';

      const initial = req.sender.name.charAt(0).toUpperCase();

      item.innerHTML = `
        <div class="user-avatar" style="width:36px;height:36px;font-size:0.85rem;">
          <span>${initial}</span>
        </div>
        <div class="friend-request-info">
          <div class="name">${escapeHtml(req.sender.name)}</div>
          <div class="status-text">Wants to connect</div>
        </div>
        <div class="friend-request-actions">
          <button class="fr-accept-btn" data-id="${req._id}" title="Accept">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="fr-reject-btn" data-id="${req._id}" title="Reject">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      `;

      // Bind accept/reject
      item.querySelector('.fr-accept-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const ok = await ChatApp.acceptFriendRequestById(id);
        if (ok) {
          loadAndShowFriendRequests();
          loadUsers(); // refresh user list to show updated status
        }
      });

      item.querySelector('.fr-reject-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const ok = await ChatApp.rejectFriendRequestById(id);
        if (ok) {
          loadAndShowFriendRequests();
        }
      });

      list.appendChild(item);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
