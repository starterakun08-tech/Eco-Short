// ============================================================
//  EcoSort IoT Dashboard + NEXA HOME MULTI-CAMERA CCTV RELAY
//  Server utama — satu port untuk semua
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || '40122', 10);

// ---- Data directory (harus sebelum routes) ----
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const iotRoutes = require('./routes/iot');
const authRoutes = require('./routes/auth');

// ---- Middleware ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ---- Static files ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- API routes ----
app.use('/api/iot', iotRoutes);
app.use('/api/auth', authRoutes);

// ---- Fallback: serve dashboard ----
app.get('/', (req, res) => {
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
  console.log('========================================');
  console.log('  NEXA HOME MULTI-CAMERA CCTV RELAY AKTIF');
  console.log('  ECOSORT IoT Dashboard AKTIF');
  console.log('  - Port : ' + PORT);
  console.log('========================================');
  console.log('');
});

