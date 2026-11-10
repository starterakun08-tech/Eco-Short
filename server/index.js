// ============================================================
//  EcoSort IoT Dashboard + NEXA HOME MULTI-CAMERA CCTV RELAY
//  Server utama — satu port untuk semua
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');

// ---- Muat konfigurasi .env otomatis ----
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
    } catch (_) {}
  } else {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (process.env[key] === undefined) process.env[key] = val;
          }
        }
      });
    } catch (_) {}
  }
}

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || '40122', 10);

// ---- Data directory (harus sebelum routes) ----
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const iotRoutes = require('./routes/iot');
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');

// ---- Middleware (Dukungan Upload Gambar CCTV Hingga 25MB) ----
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));

// ---- Static files ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- API routes ----
app.use('/api/iot', iotRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

// ---- Fallback: serve dashboard SPA for all known frontend routes ----
app.get([
  '/',
  '/dashboard',
  '/beranda',
  '/ai',
  '/cctv',
  '/analytics',
  '/analitik',
  '/reports',
  '/laporan',
  '/control',
  '/kontrol',
  '/account',
  '/akun',
  '/notifications',
  '/notifikasi'
], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---- Global error handler ----
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---- Start ----
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('====================================================');
  console.log('  ECOSORT IoT Dashboard & NEXA CCTV RELAY AKTIF');
  console.log('====================================================');
  console.log(`  - Local URL : http://localhost:${PORT}`);
  console.log(`  - Network   : http://127.0.0.1:${PORT}`);
  console.log(`  - Port      : ${PORT}`);
  console.log('  - Akun Login: admin / admin123');
  console.log('====================================================');
  console.log('');
});
