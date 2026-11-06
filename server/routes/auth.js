// ============================================================
//  Auth routes — login & verify
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

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
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ---- Pastikan ada user default ----
function ensureDefaultUser() {
  let users = readJSON(USERS_FILE, []);
  if (users.length === 0) {
    const hash = bcrypt.hashSync('ecosort2024', 10);
    users.push({ username: 'admin', passwordHash: hash });
    writeJSON(USERS_FILE, users);
    console.log('[AUTH] Default user admin/ecosort2024 dibuat');
  }
  return users;
}
ensureDefaultUser();

// ---- POST /api/auth/login ----
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  }

  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

// ---- GET /api/auth/verify ----
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, username: req.user.username });
});

module.exports = router;

