# Trustique 🔐

Trustique is a premium, secure, end-to-end encrypted messaging platform featuring real-time chat, robust cryptographic security, and custom blockchain-based message integrity verification.

---

## ✨ Features

- **🔐 End-to-End Encryption:** Messages are encrypted using AES-256-CBC client-side before transmission and decrypted upon receipt.
- **🔗 Blockchain Verification:** A custom SHA-256 blockchain ensures message integrity. Any tampering results in an instant status change (Verified ✓ / Tampered ✗).
- **💬 Real-Time Messaging:** Instant message delivery and status synchronization powered by Socket.IO.
- **👥 Friend System:** Full social features including sending, accepting, rejecting, and unfriending.
- **📎 Media & File Sharing:** Secure sharing of photos, documents, and folders with a sleek WhatsApp-inspired floating attachment menu.
- **👀 Password Visibility Toggle:** Accessible eye-toggle buttons on all login, registration, and reset forms.
- **🌙 Hybrid Theme Engine:** Seamless switching between WhatsApp-inspired Light mode and dark Telegram-inspired aesthetics.
- **📱 Responsive Layout:** Optimized for mobile (iOS/Android), tablet, and desktop interfaces.
- **📥 Data Export:** Download the underlying message blockchain directly as JSON for audits.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** MongoDB (using Mongoose ODM)
- **Real-Time Engine:** Socket.IO
- **Frontend:** Vanilla HTML5, CSS3 (Custom Variables & Animations), and JavaScript (ES6+)
- **Security:** AES-256-CBC, SHA-256 hashing, JWT (JSON Web Tokens), Bcrypt password hashing

---

## 🚀 Local Installation & Setup

Follow these simple steps to run Trustique locally:

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/SudipPatra03/trustique.git
cd trustique

# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..
```

### 2. Configure Environment Variables
Create a file named `.env` in the `backend/` directory with the following keys:
```env
PORT=5000
MONGODB_URI=your-mongodb-atlas-uri
JWT_SECRET=your-64-character-jwt-secret
AES_SECRET_KEY=your-64-hex-character-aes-key
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-sender@email.com
BREVO_SENDER_NAME=Trustique
```

### 3. Start the Server
```bash
# Start backend server from root
npm start
```
The frontend is served statically on **http://localhost:5000** (or your specified port).

---

## 🌐 Production Deployment (AWS EC2)

1. **Launch EC2 Instance:** Setup an Ubuntu 22.04 LTS `t2.micro` instance with ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) open.
2. **Setup Dependencies:** Install Node.js 20.x, PM2 (process manager), and Nginx.
3. **Configure Nginx:** Copy the reverse proxy configuration (`nginx.conf.example`) to `/etc/nginx/sites-available/trustique` and link it to `sites-enabled`.
4. **Run Server:** Launch the server using PM2 to ensure persistent background execution:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

---

## 📄 License
This project is licensed under the MIT License.
