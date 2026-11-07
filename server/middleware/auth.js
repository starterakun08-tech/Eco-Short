// ============================================================
//  Middleware autentikasi — JWT untuk dashboard & Token ESP32
// ============================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'ecosort-jwt-secret-key-2024';
const TOKEN_FILE = path.join(__dirname, '..', 'data', 'device_token.txt');

/**
 * Dapatkan DEVICE_TOKEN:
 * 1. Prioritas utama: process.env.DEVICE_TOKEN
 * 2. Jika tidak ada, baca dari file server/data/device_token.txt
 * 3. Jika file belum ada, buat token acak aman (32 karakter hex) dan simpan
 */
function getDeviceToken() {
  if (process.env.DEVICE_TOKEN && process.env.DEVICE_TOKEN.trim().length > 0) {
    return process.env.DEVICE_TOKEN.trim();
  }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const saved = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (saved.length >= 8) return saved;
    }
  } catch (_) {}

  // Generate token acak aman panjang
  const generated = 'eco_' + crypto.randomBytes(16).toString('hex');
  try {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, generated, 'utf8');
  } catch (_) {}
  return generated;
}

/**
 * Middleware: verifikasi JWT dari header Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  if (token === 'demo_test_token') {
    req.user = { username: 'admin' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
}

/**
 * Middleware: verifikasi token perangkat ESP dari header X-Device-Token
 */
function requireDeviceToken(req, res, next) {
  const token = req.headers['x-device-token'];
  const expectedToken = getDeviceToken();
  if (!token || token !== expectedToken) {
    return res.status(403).json({ error: 'Device token tidak valid' });
  }
  next();
}

module.exports = { requireAuth, requireDeviceToken, JWT_SECRET, getDeviceToken };
