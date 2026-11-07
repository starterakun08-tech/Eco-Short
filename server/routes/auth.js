// ============================================================
//  Auth routes — login, session, profile & password management
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// ---- Rate Limiter Percobaan Login Gagal (5x per 15 menit per IP) ----
const loginAttempts = new Map(); // IP -> { count: number, firstAttempt: number, lockedUntil: number }
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const MAX_FAILED_ATTEMPTS = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;

  if (entry.lockedUntil && entry.lockedUntil > now) {
    return true;
  }

  // Jika jendela 15 menit sudah lewat, reset
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }

  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.firstAttempt = now;
    entry.lockedUntil = 0;
  } else {
    entry.count += 1;
  }

  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
  }

  loginAttempts.set(ip, entry);
}

function clearFailedLogin(ip) {
  loginAttempts.delete(ip);
}

// ---- Helpers: safe JSON read/write ----
function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJSON(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ---- Pastikan ada user default ----
function ensureDefaultUser() {
  let users = readJSON(USERS_FILE, []);
  if (users.length === 0) {
    const envPass = (process.env.ADMIN_PASSWORD || '').trim();
    let initialPass = envPass;
    let mustChange = false;

    if (!initialPass) {
      // Jika ADMIN_PASSWORD kosong, buat password acak sekali dan cetak ke console server
      initialPass = 'eco_' + crypto.randomBytes(4).toString('hex');
      mustChange = true;
      console.log('');
      console.log('================================================================');
      console.log('  [KEAMANAN] ADMIN_PASSWORD tidak ditemukan di environment.');
      console.log('  [KEAMANAN] Password Administrator awal dibuat secara acak:');
      console.log('             ' + initialPass);
      console.log('  [KEAMANAN] Wajib mengganti password saat login pertama kali!');
      console.log('================================================================');
      console.log('');
    } else {
      console.log('[AUTH] Akun admin awal diinisialisasi dari environment ADMIN_PASSWORD');
    }

    const hash = bcrypt.hashSync(initialPass, 10);
    users.push({
      username: 'admin',
      passwordHash: hash,
      displayName: 'Admin EcoSort',
      role: 'Administrator',
      avatar: '',
      mustChangePassword: mustChange
    });
    writeJSON(USERS_FILE, users);
  } else {
    let changed = false;
    users.forEach(u => {
      if (!u.displayName) { u.displayName = 'Admin EcoSort'; changed = true; }
      if (!u.role) { u.role = 'Administrator'; changed = true; }
      if (u.avatar === undefined) { u.avatar = ''; changed = true; }
    });
    if (changed) writeJSON(USERS_FILE, users);
  }
  return users;
}
ensureDefaultUser();

// ---- POST /api/auth/login ----
router.post('/login', (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: 'Terlalu banyak percobaan login gagal. Silakan coba lagi dalam 15 menit demi keamanan.'
    });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }

  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    recordFailedLogin(clientIp);
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  // Login berhasil -> reset percobaan gagal
  clearFailedLogin(clientIp);

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });

  // Simpan sesi di cookie httpOnly dengan SameSite=Lax
  res.setHeader(
    'Set-Cookie',
    `ecosort_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 60 * 60}`
  );

  res.json({
    token,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || 'Administrator',
    avatar: user.avatar || '',
    mustChangePassword: Boolean(user.mustChangePassword)
  });
});

// ---- POST /api/auth/logout ----
router.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'ecosort_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true, message: 'Berhasil keluar' });
});

// ---- GET /api/auth/verify ----
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, username: req.user.username });
});

// ---- GET /api/auth/me ----
router.get('/me', requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

  res.json({
    username: user.username,
    displayName: user.displayName || 'Admin EcoSort',
    role: user.role || 'Administrator',
    avatar: user.avatar || '',
    mustChangePassword: Boolean(user.mustChangePassword)
  });
});

// ---- PUT /api/auth/profile ----
router.put('/profile', requireAuth, (req, res) => {
  const { displayName, avatar } = req.body || {};
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'Nama tampilan tidak boleh kosong' });
  }

  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

  user.displayName = displayName.trim();
  if (avatar !== undefined) user.avatar = avatar;

  writeJSON(USERS_FILE, users);
  res.json({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role || 'Administrator',
      avatar: user.avatar || ''
    }
  });
});

// ---- PUT /api/auth/password ----
router.put('/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Password lama dan password baru harus diisi' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }

  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Password lama tidak sesuai' });
  }

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.mustChangePassword = false; // Tandai password sudah diganti
  writeJSON(USERS_FILE, users);

  res.json({ ok: true, message: 'Password berhasil diperbarui' });
});

module.exports = router;
