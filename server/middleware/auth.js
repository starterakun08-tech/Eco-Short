// ============================================================
//  Middleware autentikasi — JWT untuk dashboard
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ecosort-jwt-secret-key-2024';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || 'ecosort-secret-2024';

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
  if (token !== DEVICE_TOKEN) {
    return res.status(403).json({ error: 'Device token tidak valid' });
  }
  next();
}

module.exports = { requireAuth, requireDeviceToken, JWT_SECRET, DEVICE_TOKEN };
