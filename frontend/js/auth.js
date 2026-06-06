/**
 * Auth Page Logic
 * Handles tab switching, login, registration, OTP verification,
 * forgot password, and password reset flows
 */

(function () {
  const BACKEND_URL = window.location.origin;
  const API_BASE = BACKEND_URL + '/api';

  // If already logged in, redirect to dashboard
  if (localStorage.getItem('sc-token') && localStorage.getItem('sc-user')) {
    window.location.href = 'dashboard.html';
    return;
  }

  // ---- Element References ----
  const authTabs = document.getElementById('authTabs');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const otpForm = document.getElementById('otpForm');
  const forgotForm = document.getElementById('forgotForm');
  const resetForm = document.getElementById('resetForm');
  const authMessage = document.getElementById('authMessage');

  // State
  let pendingEmail = ''; // email awaiting OTP verification or reset

  // ---- Helpers ----
  function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = 'auth-message ' + type;
  }

  function clearMessage() {
    authMessage.textContent = '';
    authMessage.className = 'auth-message';
  }

  /** Show a specific form and hide all others */
  function showForm(formId) {
    clearMessage();
    const allForms = [loginForm, registerForm, otpForm, forgotForm, resetForm];
    allForms.forEach(f => f.classList.remove('active'));

    // Show/hide tabs depending on form
    if (formId === 'loginForm' || formId === 'registerForm') {
      authTabs.style.display = 'flex';
    } else {
      authTabs.style.display = 'none';
    }

    document.getElementById(formId).classList.add('active');
  }

  // ---- Tab Switching ----
  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    showForm('loginForm');
  });

  registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    showForm('registerForm');
  });

  // ---- Login ----
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    if (!email || !password) {
      showMessage('Please fill in all fields.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('sc-token', data.token);
        localStorage.setItem('sc-user', JSON.stringify(data.user));
        showMessage('Login successful! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
      } else if (data.requiresVerification) {
        // Email not verified — show OTP form
        pendingEmail = data.email;
        document.getElementById('otpEmailDisplay').textContent = pendingEmail;
        showForm('otpForm');
        showMessage('Email not verified. A new OTP has been sent.', 'info');
      } else {
        showMessage(data.message || 'Login failed.', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In</span>';
    }
  });

  // ---- Register ----
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const termsAccepted = document.getElementById('regTerms').checked;
    const btn = document.getElementById('regBtn');

    if (!name || !email || !password || !confirmPassword) {
      showMessage('Please fill in all fields.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }

    if (!termsAccepted) {
      showMessage('You must accept the terms and conditions.', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (data.success || data.requiresVerification) {
        pendingEmail = data.email || email.toLowerCase();
        document.getElementById('otpEmailDisplay').textContent = pendingEmail;
        showForm('otpForm');
        showMessage('Account created! Check your email for the verification code.', 'success');
      } else {
        showMessage(data.message || 'Registration failed.', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Create Account</span>';
    }
  });

  // ---- OTP Verification ----
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const otp = document.getElementById('otpInput').value.trim();
    const btn = document.getElementById('verifyOtpBtn');

    if (!otp || otp.length !== 6) {
      showMessage('Please enter the 6-digit OTP code.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying...';

    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('sc-token', data.token);
        localStorage.setItem('sc-user', JSON.stringify(data.user));
        showMessage('Email verified! Redirecting...', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
      } else {
        showMessage(data.message || 'Verification failed.', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Verify Email</span>';
    }
  });

  // Resend OTP
  document.getElementById('resendOtpLink').addEventListener('click', async () => {
    clearMessage();

    try {
      const res = await fetch(`${API_BASE}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });

      const data = await res.json();
      showMessage(data.message || 'OTP resent.', data.success ? 'success' : 'error');
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    }
  });

  // Back to login from OTP
  document.getElementById('backToLoginFromOtp').addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    showForm('loginForm');
  });

  // ---- Forgot Password ----
  document.getElementById('forgotPasswordLink').addEventListener('click', () => {
    showForm('forgotForm');
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const email = document.getElementById('forgotEmail').value.trim();
    const btn = document.getElementById('forgotBtn');

    if (!email) {
      showMessage('Please enter your email.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.success) {
        pendingEmail = email.toLowerCase();
        document.getElementById('resetEmailDisplay').textContent = pendingEmail;
        showForm('resetForm');
        showMessage('Reset code sent! Check your email.', 'success');
      } else {
        showMessage(data.message || 'Failed to send reset code.', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Send Reset Code</span>';
    }
  });

  document.getElementById('backToLoginFromForgot').addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    showForm('loginForm');
  });

  // ---- Reset Password ----
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const otp = document.getElementById('resetOtp').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    const btn = document.getElementById('resetBtn');

    if (!otp || otp.length !== 6) {
      showMessage('Please enter the 6-digit OTP code.', 'error');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      showMessage('Password must be at least 6 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Resetting...';

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, otp, newPassword }),
      });

      const data = await res.json();

      if (data.success) {
        showMessage('Password reset successful! You can now log in.', 'success');
        setTimeout(() => {
          loginTab.classList.add('active');
          registerTab.classList.remove('active');
          showForm('loginForm');
        }, 1500);
      } else {
        showMessage(data.message || 'Reset failed.', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Reset Password</span>';
    }
  });

  document.getElementById('backToLoginFromReset').addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    showForm('loginForm');
  });

  // ---- Password Visibility Toggle ----
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      const eyeIcon = btn.querySelector('.eye-icon');
      const eyeOffIcon = btn.querySelector('.eye-off-icon');
      eyeIcon.style.display = isPassword ? 'none' : '';
      eyeOffIcon.style.display = isPassword ? '' : 'none';
    });
  });
})();
