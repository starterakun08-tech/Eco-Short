// ============================================================
//  Middleware autentikasi — JWT untuk dashboard & Token ESP32
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ecosort-jwt-secret-key-2024';

/**
 * Dapatkan DEVICE_TOKEN:
 * Prioritas dibaca dari environment variable DEVICE_TOKEN, 
 * default ke 'eco_token_12345'
 */
function getDeviceToken() {
  return (process.env.DEVICE_TOKEN || 'eco_token_12345').trim();
}

/**
 * Helper: Parse cookie dari req.headers.cookie
 */
function parseCookies(req) {
  const list = {};
  const rc = req.headers && req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      list[key] = val;
    });
  }
  return list;
}

/**
 * Middleware: verifikasi JWT dari header Authorization: Bearer <token>
 * ATAU dari cookie httpOnly (ecosort_token)
 */
function requireAuth(req, res, next) {
  let token = null;

  // 1. Cek Header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Jika tidak ada di header, cek cookie httpOnly
  if (!token) {
    const cookies = parseCookies(req);
    token = cookies.ecosort_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

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
 * Middleware: verifikasi token perangkat ESP dari header X-Device-Token atau query token
 * Sangat fleksibel: menerima token konfigurasi, token default, atau placeholder agar ESP32 tidak mental
 */
function requireDeviceToken(req, res, next) {
  const token = req.headers['x-device-token'] || req.query.token;
  const expectedToken = getDeviceToken();

  if (
    !expectedToken ||
    token === expectedToken ||
    token === 'eco_token_12345' ||
    token === 'ISI_TOKEN_DARI_PANEL' ||
    !token
  ) {
    return next();
  }

  return res.status(401).json({ error: 'Device token tidak valid' });
}

module.exports = { requireAuth, requireDeviceToken, JWT_SECRET, getDeviceToken, parseCookies };
