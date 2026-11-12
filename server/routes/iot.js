// ============================================================
//  IoT routes — Terima data ESP32, kirim perintah, riwayat,
//  analitik, ekspor laporan, dan manajemen perangkat EcoSort
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { requireAuth, requireDeviceToken, getDeviceToken } = require('../middleware/auth');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
const COMMAND_LOG_FILE = path.join(DATA_DIR, 'command_log.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const READ_NOTIFS_FILE = path.join(DATA_DIR, 'read_notifs.json');
const DISMISSED_NOTIFS_FILE = path.join(DATA_DIR, 'dismissed_notifs.json');

const MAX_HISTORY_PER_DEVICE = 1000;
const ONLINE_TIMEOUT_MS = 10000; // 10 detik
const COMMAND_EXPIRY_MS = 120000; // 2 menit (120 detik) kedaluwarsa

// ---- Helper Baca/Tulis File JSON Aman ----
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

// ---- Helper Generate ID Transaksi Sekuensial Runtut (Mulai dari 1 Tanpa #) ----
function getNextTransactionId(txs) {
  let maxId = 0;
  if (Array.isArray(txs) && txs.length > 0) {
    for (const t of txs) {
      if (t && t.id !== undefined && t.id !== null) {
        const num = parseInt(String(t.id).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      }
    }
  }
  return String(maxId + 1);
}

// ---- Bersihkan Perintah Kedaluwarsa (> 2 Menit Belum Diambil ESP) ----
function cleanupExpiredCommands() {
  const now = Date.now();
  const commands = readJSON(COMMANDS_FILE, {});
  const log = readJSON(COMMAND_LOG_FILE, []);
  const txs = readJSON(TRANSACTIONS_FILE, []);
  let changed = false;

  for (const deviceId in commands) {
    const list = commands[deviceId] || [];
    const validList = [];
    for (const cmd of list) {
      const age = now - new Date(cmd.createdAt || 0).getTime();
      if (age > COMMAND_EXPIRY_MS) {
        changed = true;
        // Tandai di log perintah
        const entry = log.find(l => l.id === cmd.id);
        if (entry && entry.status === 'pending') {
          entry.status = 'expired';
          entry.expiredAt = new Date().toISOString();
        }
        // Tandai di tabel transaksi
        const tx = txs.find(t => t.commandId === cmd.id);
        if (tx && (tx.status === 'Menunggu' || tx.status === 'Pending')) {
          tx.status = 'Kedaluwarsa';
        }
      } else {
        validList.push(cmd);
      }
    }
    commands[deviceId] = validList;
  }

  if (changed) {
    writeJSON(COMMANDS_FILE, commands);
    writeJSON(COMMAND_LOG_FILE, log);
    writeJSON(TRANSACTIONS_FILE, txs);
  }
}

// ---- Saat Server Baru Jalan: Kosongkan Antrean Perintah Menggantung ----
function clearPendingOnStartup() {
  const commands = readJSON(COMMANDS_FILE, {});
  const log = readJSON(COMMAND_LOG_FILE, []);
  const txs = readJSON(TRANSACTIONS_FILE, []);
  let hasPending = false;

  for (const devId in commands) {
    if (commands[devId] && commands[devId].length > 0) {
      for (const cmd of commands[devId]) {
        const entry = log.find(l => l.id === cmd.id);
        if (entry && entry.status === 'pending') {
          entry.status = 'expired';
          entry.expiredAt = new Date().toISOString();
        }
        const tx = txs.find(t => t.commandId === cmd.id);
        if (tx && (tx.status === 'Menunggu' || tx.status === 'Pending')) {
          tx.status = 'Kedaluwarsa';
        }
      }
      commands[devId] = [];
      hasPending = true;
    }
  }

  if (hasPending) {
    writeJSON(COMMANDS_FILE, commands);
    writeJSON(COMMAND_LOG_FILE, log);
    writeJSON(TRANSACTIONS_FILE, txs);
  }
}
clearPendingOnStartup();

// =================================================================
//  POST /api/iot/data — ESP32 mengirim data telemetri
// =================================================================
router.post('/data', requireDeviceToken, (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.deviceId) {
      return res.status(400).json({ error: 'deviceId diperlukan' });
    }

    const deviceId = body.deviceId;
    const now = new Date().toISOString();

    // --- Simpan Status Perangkat Terkini ---
    const devices = readJSON(DEVICES_FILE, {});
    const existing = devices[deviceId] || {};
    const tareOffset = Number(existing.tareOffsetGram || 0);

    // Ambil raw weight yang dibaca sensor
    const incomingRaw = Number(body.rawWeightGram ?? body.currentWeightGram ?? body.weightGram ?? existing.rawWeightGram ?? 0);
    const rawWeight = Math.max(0, incomingRaw);

    // Hitung berat sampah riil setelah dikurangi beban tong/wadah (tare offset)
    let realWeight = Math.max(0, Math.round((rawWeight - tareOffset) * 10) / 10);
    if (realWeight < 1.0) realWeight = 0; // Filter toleransi noise nol saat bak kosong

    devices[deviceId] = {
      deviceId,
      lastSeen: now,
      rawWeightGram: rawWeight,
      tareOffsetGram: tareOffset,
      weightGram: realWeight,
      totalWeightGram: body.totalWeightGram ?? existing.totalWeightGram ?? 0,
      currentWeightGram: realWeight,
      distanceCm: body.distanceCm ?? existing.distanceCm ?? null,
      fullThresholdCm: body.fullThresholdCm ?? existing.fullThresholdCm ?? 10,
      emptyDistanceCm: body.emptyDistanceCm ?? existing.emptyDistanceCm ?? 35,
      surroundingTrashCount: body.surroundingTrashCount !== undefined ? Number(body.surroundingTrashCount) : (existing.surroundingTrashCount ?? 0)
    };
    writeJSON(DEVICES_FILE, devices);

    // --- Simpan Riwayat Sensor ---
    const history = readJSON(HISTORY_FILE, {});
    if (!history[deviceId]) history[deviceId] = [];
    history[deviceId].push({
      t: now,
      w: realWeight,
      tw: body.totalWeightGram ?? existing.totalWeightGram ?? 0,
      d: body.distanceCm ?? null
    });
    if (history[deviceId].length > MAX_HISTORY_PER_DEVICE) {
      history[deviceId] = history[deviceId].slice(-MAX_HISTORY_PER_DEVICE);
    }
    writeJSON(HISTORY_FILE, history);

    // --- Catat kejadian penimbangan jika ada berat terakumulasi ---
    if (body.resetWeight && realWeight > 0) {
      const txs = readJSON(TRANSACTIONS_FILE, []);
      const nowObj = new Date();
      const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                     nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      const addedWeight = realWeight;
      txs.unshift({
        id: getNextTransactionId(txs),
        date: nowStr,
        timestamp: now,
        type: 'Penimbangan',
        amount: `+${Number(addedWeight).toFixed(1)} g`,
        rawAmount: `+${Number(addedWeight).toFixed(1)} g`,
        distance: body.distanceCm !== null && body.distanceCm !== undefined ? `${body.distanceCm} cm` : '--',
        status: 'Selesai'
      });
      if (txs.length > 100) txs.pop();
      writeJSON(TRANSACTIONS_FILE, txs);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[IOT/data] Error:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// =================================================================
//  GET /api/iot/commands?deviceId=xxx — ESP32 mengambil perintah
//  (Status perintah HANYA berubah jadi 'Selesai' saat diambil ESP32)
// =================================================================
router.get('/commands', requireDeviceToken, (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });

    cleanupExpiredCommands();

    const commands = readJSON(COMMANDS_FILE, {});
    const pending = commands[deviceId] || [];

    if (pending.length > 0) {
      commands[deviceId] = [];
      writeJSON(COMMANDS_FILE, commands);

      // Tandai perintah selesai diambil dan dieksekusi ESP32 (Selesai)
      const log = readJSON(COMMAND_LOG_FILE, []);
      const txs = readJSON(TRANSACTIONS_FILE, []);
      const nowIso = new Date().toISOString();

      for (const cmd of pending) {
        const entry = log.find(l => l.id === cmd.id);
        if (entry) {
          entry.status = 'delivered';
          entry.deliveredAt = nowIso;
        }
        const tx = txs.find(t => t.commandId === cmd.id);
        if (tx && tx.status === 'Menunggu') {
          tx.status = 'Selesai';
        }
      }
      writeJSON(COMMAND_LOG_FILE, log);
      writeJSON(TRANSACTIONS_FILE, txs);
    }

    res.json({ commands: pending });
  } catch (err) {
    console.error('[IOT/commands] Error:', err.message);
    res.json({ commands: [] });
  }
});

// =================================================================
//  POST /api/iot/command — Dashboard mengirim perintah ke antrean
//  (Status awal: 'Menunggu', kedaluwarsa 2 menit jika ESP tidak mengambil)
// =================================================================
router.post('/command', requireAuth, (req, res) => {
  try {
    cleanupExpiredCommands();

    const { deviceId, type, params } = req.body;
    if (!deviceId || !type) {
      return res.status(400).json({ error: 'deviceId dan type diperlukan' });
    }

    const validTypes = ['tare', 'set_calibration', 'set_tare_offset', 'set_interval', 'restart'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipe perintah tidak valid: ' + type });
    }

    // --- Perbaiki Bug Tare & Hitungan Riil Saat Ini ---
    if (type === 'tare') {
      // 1. Langsung nol-kan beban timbangan di sistem server sehingga website langsung menampilkan 0.0 g
      // dan tidak menunggu ESP32 mengirim data atau terjebak data lama saat bak kosong
      const devices = readJSON(DEVICES_FILE, {});
      const dev = devices[deviceId] || { deviceId };
      dev.rawWeightGram = 0;
      dev.currentWeightGram = 0;
      dev.weightGram = 0;
      dev.totalWeightGram = 0;
      dev.lastTareAt = new Date().toISOString();
      devices[deviceId] = dev;
      writeJSON(DEVICES_FILE, devices);

      // 2. Catat titik nol ke riwayat sensor
      const history = readJSON(HISTORY_FILE, {});
      if (!history[deviceId]) history[deviceId] = [];
      history[deviceId].push({
        t: new Date().toISOString(),
        w: 0,
        tw: 0,
        d: dev.distanceCm ?? null
      });
      if (history[deviceId].length > MAX_HISTORY_PER_DEVICE) {
        history[deviceId] = history[deviceId].slice(-MAX_HISTORY_PER_DEVICE);
      }
      writeJSON(HISTORY_FILE, history);
    } else if (type === 'set_tare_offset') {
      const offset = Math.max(0, parseFloat(params?.value) || 0);
      const devices = readJSON(DEVICES_FILE, {});
      const dev = devices[deviceId] || { deviceId };
      dev.tareOffsetGram = offset;
      const raw = Number(dev.rawWeightGram ?? dev.weightGram ?? 0);
      dev.rawWeightGram = raw;
      dev.currentWeightGram = Math.max(0, Math.round((raw - offset) * 10) / 10);
      dev.weightGram = dev.currentWeightGram;
      devices[deviceId] = dev;
      writeJSON(DEVICES_FILE, devices);
    }

    const commands = readJSON(COMMANDS_FILE, {});
    if (!commands[deviceId]) commands[deviceId] = [];

    const log = readJSON(COMMAND_LOG_FILE, []);
    const txs = readJSON(TRANSACTIONS_FILE, []);

    // Cegah perintah bertumpuk: batalkan perintah lama dengan tipe sama jika masih pending
    const existingIdx = commands[deviceId].findIndex(c => c.type === type);
    if (existingIdx !== -1) {
      const oldCmd = commands[deviceId][existingIdx];
      const oldLog = log.find(l => l.id === oldCmd.id);
      if (oldLog && oldLog.status === 'pending') {
        oldLog.status = 'replaced';
      }
      const oldTx = txs.find(t => t.commandId === oldCmd.id);
      if (oldTx && oldTx.status === 'Menunggu') {
        oldTx.status = 'Dibatalkan';
      }
      commands[deviceId].splice(existingIdx, 1);
    }

    const cmd = {
      id: uuidv4(),
      type,
      params: params || {},
      createdAt: new Date().toISOString()
    };

    commands[deviceId].push(cmd);
    writeJSON(COMMANDS_FILE, commands);

    log.push({
      id: cmd.id,
      deviceId,
      type: cmd.type,
      params: cmd.params,
      createdAt: cmd.createdAt,
      status: 'pending'
    });
    if (log.length > 50) log.splice(0, log.length - 50);
    writeJSON(COMMAND_LOG_FILE, log);

    const nowObj = new Date();
    const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                   nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const cmdLabel = cmd.type === 'tare' ? 'Tare Nol Timbangan' : cmd.type === 'set_tare_offset' ? `Tare Kustom: ${cmd.params?.value || 0} g` : cmd.type === 'restart' ? 'Restart ESP32' : `${cmd.type}: ${cmd.params?.value || ''}`;

    txs.unshift({
      id: getNextTransactionId(txs),
      commandId: cmd.id,
      date: nowStr,
      timestamp: cmd.createdAt,
      type: 'Perintah',
      amount: cmdLabel,
      rawAmount: cmdLabel,
      distance: '--',
      status: cmd.type === 'tare' || cmd.type === 'set_tare_offset' ? 'Selesai' : 'Menunggu'
    });
    if (txs.length > 100) txs.pop();
    writeJSON(TRANSACTIONS_FILE, txs);

    res.json({ status: 'queued', command: cmd });
  } catch (err) {
    console.error('[IOT/command] Error:', err.message);
    res.status(500).json({ error: 'Gagal mengirim perintah' });
  }
});

// =================================================================
//  POST /api/iot/tare-offset — Atur berat wadah/komponen (Tare Kustom)
//  Admin input berat tong sampah agar tidak masuk ke hitungan sampah riil
// =================================================================
router.post('/tare-offset', requireAuth, (req, res) => {
  try {
    const { deviceId = 'esp32-ecosort-1', tareOffsetGram = 0 } = req.body || {};
    const offset = Math.max(0, parseFloat(tareOffsetGram) || 0);

    const devices = readJSON(DEVICES_FILE, {});
    const existing = devices[deviceId] || {
      deviceId,
      lastSeen: new Date().toISOString(),
      weightGram: 0,
      totalWeightGram: 0,
      currentWeightGram: 0,
      distanceCm: 30,
      fullThresholdCm: 10,
      emptyDistanceCm: 35
    };

    existing.tareOffsetGram = offset;
    const raw = Number(existing.rawWeightGram ?? existing.weightGram ?? 0);
    existing.rawWeightGram = raw;
    existing.currentWeightGram = Math.max(0, Math.round((raw - offset) * 10) / 10);
    existing.weightGram = existing.currentWeightGram;

    devices[deviceId] = existing;
    writeJSON(DEVICES_FILE, devices);

    // Catat log transaksi agar admin tahu perubahan
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const nowObj = new Date();
    const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                   nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    txs.unshift({
      id: getNextTransactionId(txs),
      date: nowStr,
      timestamp: new Date().toISOString(),
      type: 'Perintah',
      amount: `Tare Kustom: ${offset.toFixed(1)} g`,
      rawAmount: `Tare Wadah: ${offset.toFixed(1)} g`,
      distance: '--',
      status: 'Selesai'
    });
    if (txs.length > 100) txs.pop();
    writeJSON(TRANSACTIONS_FILE, txs);

    res.json({ success: true, tareOffsetGram: offset, currentWeightGram: existing.currentWeightGram });
  } catch (err) {
    console.error('[IOT/tare-offset] Error:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan tare offset' });
  }
});

// =================================================================
//  POST /api/iot/tare — Nol-kan timbangan website secara langsung
// =================================================================
router.post('/tare', requireAuth, (req, res) => {
  try {
    const { deviceId = 'esp32-ecosort-1' } = req.body || {};
    const devices = readJSON(DEVICES_FILE, {});
    const existing = devices[deviceId] || { deviceId };
    existing.rawWeightGram = 0;
    existing.currentWeightGram = 0;
    existing.weightGram = 0;
    existing.totalWeightGram = 0;
    existing.lastTareAt = new Date().toISOString();
    devices[deviceId] = existing;
    writeJSON(DEVICES_FILE, devices);

    const history = readJSON(HISTORY_FILE, {});
    if (!history[deviceId]) history[deviceId] = [];
    history[deviceId].push({
      t: new Date().toISOString(),
      w: 0,
      tw: 0,
      d: existing.distanceCm ?? null
    });
    if (history[deviceId].length > MAX_HISTORY_PER_DEVICE) {
      history[deviceId] = history[deviceId].slice(-MAX_HISTORY_PER_DEVICE);
    }
    writeJSON(HISTORY_FILE, history);

    // Antrekan perintah tare ke ESP32 agar sensor fisik HX711 ikut tare saat terkoneksi
    const commands = readJSON(COMMANDS_FILE, {});
    if (!commands[deviceId]) commands[deviceId] = [];
    commands[deviceId].push({
      id: uuidv4(),
      type: 'tare',
      params: {},
      createdAt: new Date().toISOString()
    });
    writeJSON(COMMANDS_FILE, commands);

    // Catat transaksi tare
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const nowObj = new Date();
    const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                   nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    txs.unshift({
      id: getNextTransactionId(txs),
      date: nowStr,
      timestamp: new Date().toISOString(),
      type: 'Perintah',
      amount: 'Tare Nol Timbangan',
      rawAmount: 'Tare Nol Timbangan',
      distance: '--',
      status: 'Selesai'
    });
    if (txs.length > 100) txs.pop();
    writeJSON(TRANSACTIONS_FILE, txs);

    res.json({ success: true, message: 'Timbangan berhasil di-nolkan (0.0 g)' });
  } catch (err) {
    console.error('[IOT/tare] Error:', err.message);
    res.status(500).json({ error: 'Gagal melakukan tare' });
  }
});

// =================================================================
//  POST /api/iot/surrounding-trash — Update / Simulasi deteksi kamera sampah sekitar
//  0: Lingkungan bersih (Hijau)
//  1-5: Waspada (Kuning)
//  >5: Bahaya / Penuh (Merah)
// =================================================================
router.post('/surrounding-trash', requireAuth, (req, res) => {
  try {
    const { deviceId = 'esp32-ecosort-1', count = 0 } = req.body || {};
    const devices = readJSON(DEVICES_FILE, {});
    const existing = devices[deviceId] || {
      deviceId,
      lastSeen: new Date().toISOString(),
      weightGram: 0,
      totalWeightGram: 0,
      currentWeightGram: 0,
      distanceCm: 30,
      fullThresholdCm: 10,
      emptyDistanceCm: 35
    };
    existing.surroundingTrashCount = Math.max(0, Number(count) || 0);
    existing.surroundingTrashStatus = existing.surroundingTrashCount === 0 ? 'Bersih' : (existing.surroundingTrashCount <= 5 ? 'Waspada' : 'Kotor');
    devices[deviceId] = existing;
    writeJSON(DEVICES_FILE, devices);
    res.json({ success: true, count: existing.surroundingTrashCount });
  } catch (err) {
    console.error('[IOT/surrounding-trash] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  GET /api/iot/devices — Dashboard mengambil status perangkat
// =================================================================
router.get('/devices', requireAuth, (req, res) => {
  try {
    cleanupExpiredCommands();
    const devices = readJSON(DEVICES_FILE, {});
    const now = Date.now();
    const result = [];

    for (const [id, dev] of Object.entries(devices)) {
      const lastSeenMs = new Date(dev.lastSeen || 0).getTime();
      const online = (now - lastSeenMs) < ONLINE_TIMEOUT_MS;
      result.push({ ...dev, online });
    }

    res.json({ devices: result });
  } catch (err) {
    console.error('[IOT/devices] Error:', err.message);
    res.json({ devices: [] });
  }
});

// =================================================================
//  GET /api/iot/history?deviceId=xxx&limit=100
// =================================================================
router.get('/history', requireAuth, (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    const limit = parseInt(req.query.limit || '100', 10);
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });

    const history = readJSON(HISTORY_FILE, {});
    const entries = history[deviceId] || [];
    const sliced = entries.slice(-limit);

    res.json({ history: sliced });
  } catch (err) {
    console.error('[IOT/history] Error:', err.message);
    res.json({ history: [] });
  }
});

// =================================================================
//  GET /api/iot/transactions — Riwayat kejadian penimbangan & perintah
// =================================================================
router.get('/transactions', requireAuth, (req, res) => {
  try {
    cleanupExpiredCommands();
    const txs = readJSON(TRANSACTIONS_FILE, []);
    txs.sort((a, b) => {
      const tA = new Date(a.timestamp || 0).getTime();
      const tB = new Date(b.timestamp || 0).getTime();
      if (tB !== tA) return tB - tA;
      const idA = parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0;
      const idB = parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0;
      return idB - idA;
    });
    res.json({ transactions: txs.slice(0, 100) });
  } catch (err) {
    res.json({ transactions: [] });
  }
});

// =================================================================
//  DELETE /api/iot/transactions — Hapus seluruh log kejadian
// =================================================================
router.delete('/transactions', requireAuth, (req, res) => {
  try {
    writeJSON(TRANSACTIONS_FILE, []);
    res.json({ ok: true, message: 'Seluruh riwayat log berhasil dibersihkan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membersihkan log' });
  }
});

// =================================================================
//  DELETE /api/iot/transactions/:id — Hapus satu catatan log kejadian
// =================================================================
router.delete('/transactions/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const filtered = txs.filter(t => String(t.id) !== String(id));
    writeJSON(TRANSACTIONS_FILE, filtered);
    res.json({ ok: true, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus log' });
  }
});

// =================================================================
//  GET /api/iot/command-log — Log perintah kontrol
// =================================================================
router.get('/command-log', requireAuth, (req, res) => {
  try {
    cleanupExpiredCommands();
    const log = readJSON(COMMAND_LOG_FILE, []);
    res.json({ log: log.slice(-30).reverse() });
  } catch (err) {
    res.json({ log: [] });
  }
});

// =================================================================
//  GET /api/iot/device-token — Info token tersensor & status demo
// =================================================================
router.get('/device-token', requireAuth, (_req, res) => {
  const token = getDeviceToken();
  let masked = 'Belum dikonfigurasi';
  if (token) {
    if (token.length > 8) {
      masked = token.substring(0, 4) + '•'.repeat(Math.min(24, Math.max(8, token.length - 4)));
    } else {
      masked = '••••••••';
    }
  }
  res.json({
    deviceToken: token,
    maskedToken: masked,
    envConfigured: Boolean(token),
    demoMode: process.env.DEMO_MODE === '1'
  });
});

// =================================================================
//  GET /api/iot/analytics — Analitik murni kejadian penimbangan
// =================================================================
router.get('/analytics', requireAuth, (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'esp32-ecosort-1';
    const range = req.query.range || 'today';

    const devicesAll = readJSON(DEVICES_FILE, {});
    const dev = devicesAll[deviceId] || Object.values(devicesAll)[0] || {};
    const surroundingTrashCount = Number(dev.surroundingTrashCount ?? 0);
    const surroundingTrashStatus = dev.surroundingTrashStatus || (surroundingTrashCount === 0 ? 'Bersih' : surroundingTrashCount <= 5 ? 'Waspada' : 'Kotor');

    const historyAll = readJSON(HISTORY_FILE, {});
    const list = historyAll[deviceId] || [];
    const txs = readJSON(TRANSACTIONS_FILE, []);

    // Pisahkan transaksi penimbangan dan perintah
    const weighingTxs = txs.filter(t => t.type === 'Penimbangan' || (!t.commandId && t.type !== 'Perintah'));
    const commandTxs = txs.filter(t => t.type === 'Perintah' || Boolean(t.commandId));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    let hourlyLabels = [];
    let hourlyWeights = [];
    let hourlyCapacities = [];
    let yesterdayWeights = [];
    let hasYesterdayData = false;

    if (range === '7days') {
      // 7 Hari Terakhir: dari (today - 6 hari) sampai hari ini
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date(startOfToday - i * 86400000);
        const dEnd = new Date(dStart.getTime() + 86400000);
        const dName = dayNames[dStart.getDay()];
        const dDate = `${dStart.getDate()} ${monthNames[dStart.getMonth()]}`;
        hourlyLabels.push(`${dName}, ${dDate}`);

        const dayMatches = list.filter(item => {
          const t = new Date(item.t).getTime();
          return t >= dStart.getTime() && t < dEnd.getTime();
        });

        const dayTxs = weighingTxs.filter(t => {
          if (!t.timestamp) return false;
          const time = new Date(t.timestamp).getTime();
          return time >= dStart.getTime() && time < dEnd.getTime();
        });

        if (dayMatches.length > 0) {
          const avgW = dayMatches.reduce((acc, c) => acc + (c.w || 0), 0) / dayMatches.length;
          hourlyWeights.push(Number(avgW.toFixed(1)));
          // Kapasitas dihitung proporsional terhadap kapasitas maksimal 10 kg (10.000 g)
          const fillPct = Math.min(100, Math.max(0, Math.round((avgW / 10000) * 100)));
          hourlyCapacities.push(fillPct);
        } else if (dayTxs.length > 0) {
          const txWeights = dayTxs.map(t => {
            const m = String(t.amount || t.rawAmount || '').match(/([0-9.]+)/);
            return m ? parseFloat(m[1]) : 0;
          }).filter(w => w > 0);
          const avgW = txWeights.length > 0 ? txWeights.reduce((a, b) => a + b, 0) / txWeights.length : 0;
          hourlyWeights.push(Number(avgW.toFixed(1)));
          hourlyCapacities.push(Math.min(100, Math.round((avgW / 10000) * 100)));
        } else if (i === 0 && (dev.currentWeightGram > 0 || dev.weightGram > 0)) {
          const curW = dev.currentWeightGram ?? dev.weightGram ?? 0;
          hourlyWeights.push(Number(curW.toFixed(1)));
          hourlyCapacities.push(Math.min(100, Math.max(0, Math.round((curW / 10000) * 100))));
        } else if (i === 6 && (dev.currentWeightGram > 0 || dev.weightGram > 0 || list.length > 0 || weighingTxs.length > 0)) {
          hourlyWeights.push(0.0);
          hourlyCapacities.push(0);
        } else {
          hourlyWeights.push(null);
          hourlyCapacities.push(null);
        }
      }
    } else if (range === '30days') {
      // 30 Hari Terakhir: dari (today - 29 hari) sampai hari ini
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      for (let i = 29; i >= 0; i--) {
        const dStart = new Date(startOfToday - i * 86400000);
        const dEnd = new Date(dStart.getTime() + 86400000);
        const dDate = `${dStart.getDate()} ${monthNames[dStart.getMonth()]}`;
        hourlyLabels.push(dDate);

        const dayMatches = list.filter(item => {
          const t = new Date(item.t).getTime();
          return t >= dStart.getTime() && t < dEnd.getTime();
        });

        const dayTxs = weighingTxs.filter(t => {
          if (!t.timestamp) return false;
          const time = new Date(t.timestamp).getTime();
          return time >= dStart.getTime() && time < dEnd.getTime();
        });

        if (dayMatches.length > 0) {
          const avgW = dayMatches.reduce((acc, c) => acc + (c.w || 0), 0) / dayMatches.length;
          hourlyWeights.push(Number(avgW.toFixed(1)));
          // Kapasitas dihitung proporsional terhadap kapasitas maksimal 10 kg (10.000 g)
          const fillPct = Math.min(100, Math.max(0, Math.round((avgW / 10000) * 100)));
          hourlyCapacities.push(fillPct);
        } else if (dayTxs.length > 0) {
          const txWeights = dayTxs.map(t => {
            const m = String(t.amount || t.rawAmount || '').match(/([0-9.]+)/);
            return m ? parseFloat(m[1]) : 0;
          }).filter(w => w > 0);
          const avgW = txWeights.length > 0 ? txWeights.reduce((a, b) => a + b, 0) / txWeights.length : 0;
          hourlyWeights.push(Number(avgW.toFixed(1)));
          hourlyCapacities.push(Math.min(100, Math.round((avgW / 10000) * 100)));
        } else if (i === 0 && (dev.currentWeightGram > 0 || dev.weightGram > 0)) {
          const curW = dev.currentWeightGram ?? dev.weightGram ?? 0;
          hourlyWeights.push(Number(curW.toFixed(1)));
          hourlyCapacities.push(Math.min(100, Math.max(0, Math.round((curW / 10000) * 100))));
        } else if (i === 29 && (dev.currentWeightGram > 0 || dev.weightGram > 0 || list.length > 0 || weighingTxs.length > 0)) {
          hourlyWeights.push(0.0);
          hourlyCapacities.push(0);
        } else {
          hourlyWeights.push(null);
          hourlyCapacities.push(null);
        }
      }
    } else {
      // Default: 'today' (12 slot kelipatan 2 jam: 00:00 - 22:00)
      const todayData = list.filter(item => {
        const t = new Date(item.t).getTime();
        return t >= startOfToday;
      });

      const yesterdayData = list.filter(item => {
        const t = new Date(item.t).getTime();
        return t >= startOfYesterday && t < startOfToday;
      });

      const curLiveWeight = Number(dev.currentWeightGram ?? dev.weightGram ?? 0);
      for (let h = 0; h < 24; h += 2) {
        const hStr = String(h).padStart(2, '0') + ':00';
        hourlyLabels.push(hStr);

        const hStart = startOfToday + h * 3600000;
        const hEnd = hStart + 2 * 3600000;

        const matches = todayData.filter(d => {
          const t = new Date(d.t).getTime();
          return t >= hStart && t < hEnd;
        });

        const hTxs = weighingTxs.filter(t => {
          if (!t.timestamp) return false;
          const time = new Date(t.timestamp).getTime();
          return time >= hStart && time < hEnd;
        });

        const isCurrentSlot = now.getTime() >= hStart && now.getTime() < hEnd;

        if (matches.length > 0) {
          const avgW = matches.reduce((acc, c) => acc + (c.w || 0), 0) / matches.length;
          hourlyWeights.push(Number(avgW.toFixed(1)));

          // Kapasitas dihitung proporsional terhadap kapasitas maksimal 10 kg (10.000 g)
          const fillPct = Math.min(100, Math.max(0, Math.round((avgW / 10000) * 100)));
          hourlyCapacities.push(fillPct);
        } else if (hTxs.length > 0) {
          const txWeights = hTxs.map(t => {
            const m = String(t.amount || t.rawAmount || '').match(/([0-9.]+)/);
            return m ? parseFloat(m[1]) : 0;
          }).filter(w => w > 0);
          const avgW = txWeights.length > 0 ? txWeights.reduce((a, b) => a + b, 0) / txWeights.length : 0;
          hourlyWeights.push(Number(avgW.toFixed(1)));
          hourlyCapacities.push(Math.min(100, Math.round((avgW / 10000) * 100)));
        } else if (isCurrentSlot && (curLiveWeight > 0 || dev.lastSeen)) {
          hourlyWeights.push(Number(curLiveWeight.toFixed(1)));
          const fillPct = Math.min(100, Math.max(0, Math.round((curLiveWeight / 10000) * 100)));
          hourlyCapacities.push(fillPct);
        } else if (h === 0 && (curLiveWeight > 0 || todayData.length > 0 || weighingTxs.length > 0 || dev.lastSeen)) {
          // Titik baseline awal hari (00:00) agar grafik membentuk garis yang terhubung
          hourlyWeights.push(0.0);
          hourlyCapacities.push(0);
        } else {
          hourlyWeights.push(null);
          hourlyCapacities.push(null);
        }

        // Kemarin
        const yMatches = yesterdayData.filter(d => {
          const t = new Date(d.t).getTime();
          return t >= (hStart - 86400000) && t < (hEnd - 86400000);
        });
        if (yMatches.length > 0) {
          const avgYW = yMatches.reduce((acc, c) => acc + (c.w || 0), 0) / yMatches.length;
          yesterdayWeights.push(Number(avgYW.toFixed(1)));
        } else {
          yesterdayWeights.push(null);
        }
      }
      hasYesterdayData = yesterdayWeights.some(v => v !== null);
    }

    // Filter transaksi untuk rentang yang dipilih saat menghitung rata-rata & puncak
    let rangeFilterMs = startOfToday;
    if (range === '7days') rangeFilterMs = startOfToday - 6 * 86400000;
    if (range === '30days') rangeFilterMs = startOfToday - 29 * 86400000;

    const filteredWeighingTxs = weighingTxs.filter(t => {
      if (!t.timestamp) return true;
      return new Date(t.timestamp).getTime() >= rangeFilterMs;
    });

    const weighingAmounts = (filteredWeighingTxs.length > 0 ? filteredWeighingTxs : weighingTxs).map(t => {
      const match = String(t.amount || t.rawAmount || '').match(/([0-9.]+)/);
      return match ? parseFloat(match[1]) : 0;
    }).filter(w => w > 0);

    const validHistoryWeights = hourlyWeights.filter(w => w !== null && w > 0);
    const weightsRecorded = weighingAmounts.length > 0 ? weighingAmounts : validHistoryWeights;

    const avgWeight = weightsRecorded.length > 0
      ? (weightsRecorded.reduce((a, b) => a + b, 0) / weightsRecorded.length).toFixed(1)
      : (dev.currentWeightGram ? Number(dev.currentWeightGram).toFixed(1) : '0.0');
    const peakWeight = weightsRecorded.length > 0
      ? Math.max(...weightsRecorded).toFixed(1)
      : (dev.currentWeightGram ? Number(dev.currentWeightGram).toFixed(1) : '0.0');

    const validHistoryCapacities = hourlyCapacities.filter(c => c !== null);
    const currentCap = dev.fillPercent != null ? Math.min(100, Math.max(0, Math.round(Number(dev.fillPercent)))) : Math.min(100, Math.round((Number(avgWeight) / 10000) * 100));
    const peakCapacity = validHistoryCapacities.length > 0 ? Math.max(...validHistoryCapacities) : currentCap;

    res.json({
      range,
      labels: hourlyLabels,
      todayWeights: hourlyWeights,
      todayCapacities: hourlyCapacities,
      yesterdayWeights: hasYesterdayData ? yesterdayWeights : [],
      hasYesterdayData,
      metrics: {
        avgWeight: avgWeight + ' g',
        peakWeight: peakWeight + ' g',
        capacity: peakCapacity + '%',
        peakCapacity: peakCapacity + '%',
        surroundingTrashCount: (range === '7days' || range === '30days') ? '-' : surroundingTrashCount,
        surroundingTrashStatus: (range === '7days' || range === '30days') ? '-' : surroundingTrashStatus,
        weighingEvents: filteredWeighingTxs.length,
        commandEvents: commandTxs.length,
        totalEvents: filteredWeighingTxs.length
      }
    });
  } catch (err) {
    console.error('[IOT/analytics] Error:', err.message);
    res.status(500).json({ error: 'Gagal memuat data analitik' });
  }
});

// =================================================================
//  GET /api/iot/export/csv — Unduh data log dalam format CSV (6 Kolom)
// =================================================================
router.get('/export/csv', requireAuth, (_req, res) => {
  try {
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const header = 'ID,Waktu_Lengkap,Jenis_Aksi,Nilai_Berat,Jarak_Sensor,Status\n';
    const rows = txs.map(t => {
      const id = String(t.id || '').replace(/^#+/, '').replace(/"/g, '""');
      const date = (t.date || '').replace(/"/g, '""');
      const type = (t.type || (t.commandId ? 'Perintah' : 'Penimbangan')).replace(/"/g, '""');
      const amount = (t.rawAmount || t.amount || '--').replace(/"/g, '""');
      const dist = (t.distance || '--').replace(/"/g, '""');
      const status = (t.status || '').replace(/"/g, '""');
      return `"${id}","${date}","${type}","${amount}","${dist}","${status}"`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ecosort-log-' + Date.now() + '.csv"');
    res.send(header + rows);
  } catch (err) {
    res.status(500).send('Gagal mengekspor CSV');
  }
});

// =================================================================
//  GET /api/iot/export/json — Unduh data log dalam format JSON
// =================================================================
router.get('/export/json', requireAuth, (_req, res) => {
  try {
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const history = readJSON(HISTORY_FILE, {});
    const devices = readJSON(DEVICES_FILE, {});

    const exportData = {
      exportedAt: new Date().toISOString(),
      system: 'EcoSort IoT Smart Waste Monitoring',
      device: devices['esp32-ecosort-1'] || null,
      transactions: txs,
      sensorHistory: history['esp32-ecosort-1'] || []
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ecosort-data-' + Date.now() + '.json"');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    res.status(500).send('Gagal mengekspor JSON');
  }
});

// =================================================================
//  POST /api/iot/demo-seed — Generator Data Demo (Hanya jika DEMO_MODE=1)
// =================================================================
router.post('/demo-seed', requireAuth, (_req, res) => {
  if (process.env.DEMO_MODE !== '1') {
    return res.status(403).json({ error: 'Mode demo tidak diaktifkan pada server (DEMO_MODE!=1)' });
  }

  try {
    const now = Date.now();
    const devId = 'esp32-ecosort-1';

    // Perangkat live demo
    const devices = readJSON(DEVICES_FILE, {});
    devices[devId] = {
      deviceId: devId,
      lastSeen: new Date().toISOString(),
      rawWeightGram: 245.5,
      tareOffsetGram: 0,
      weightGram: 245.5,
      totalWeightGram: 1820.0,
      currentWeightGram: 245.5,
      distanceCm: 21.4,
      fullThresholdCm: 10,
      emptyDistanceCm: 35,
      surroundingTrashCount: 0
    };
    writeJSON(DEVICES_FILE, devices);

    // Riwayat sensor 12 titik
    const history = readJSON(HISTORY_FILE, {});
    history[devId] = [];
    const sampleWeights = [120, 140, 190, 220, 240, 200, 240, 310, 420, 250, 160, 245.5];
    for (let i = 0; i < sampleWeights.length; i++) {
      const timeMs = now - (sampleWeights.length - 1 - i) * 600000;
      history[devId].push({
        t: new Date(timeMs).toISOString(),
        w: sampleWeights[i],
        tw: 1000 + sampleWeights[i] * 2,
        d: 28 - Math.round(i * 0.6)
      });
    }
    writeJSON(HISTORY_FILE, history);

    // 4 Transaksi demo (kejadian nyata dengan ID numerik urut tanpa #)
    const txs = [
      {
        id: '4',
        date: 'Hari ini, 14.05',
        timestamp: new Date(now - 1200000).toISOString(),
        type: 'Penimbangan',
        amount: '+245.5 g',
        rawAmount: '+245.5 g',
        distance: '21.4 cm',
        status: 'Selesai'
      },
      {
        id: '3',
        date: 'Hari ini, 13.50',
        timestamp: new Date(now - 2100000).toISOString(),
        type: 'Perintah',
        amount: 'Tare Nol Timbangan',
        rawAmount: 'Tare Nol Timbangan',
        distance: '--',
        status: 'Selesai'
      },
      {
        id: '2',
        date: 'Hari ini, 13.15',
        timestamp: new Date(now - 4200000).toISOString(),
        type: 'Penimbangan',
        amount: '+130.2 g',
        rawAmount: '+130.2 g',
        distance: '23.0 cm',
        status: 'Selesai'
      },
      {
        id: '1',
        date: 'Hari ini, 12.40',
        timestamp: new Date(now - 6300000).toISOString(),
        type: 'Penimbangan',
        amount: '+510.0 g',
        rawAmount: '+510.0 g',
        distance: '18.5 cm',
        status: 'Selesai'
      }
    ];
    writeJSON(TRANSACTIONS_FILE, txs);

    res.json({ status: 'ok', message: 'Data demo berhasil dimuat' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat demo' });
  }
});

// =================================================================
//  POST /api/iot/clear-data — Kosongkan Riwayat (Perlu Konfirmasi "RESET")
// =================================================================
router.post('/clear-data', requireAuth, (req, res) => {
  if (req.body?.confirm !== 'RESET') {
    return res.status(400).json({ error: 'Konfirmasi tidak sesuai. Harap masukkan kata "RESET".' });
  }

  try {
    writeJSON(HISTORY_FILE, {});
    writeJSON(TRANSACTIONS_FILE, []);
    writeJSON(COMMANDS_FILE, {});
    writeJSON(COMMAND_LOG_FILE, []);
    writeJSON(DEVICES_FILE, {});
    res.json({ status: 'ok', message: 'Seluruh riwayat dibersihkan. Keadaan jujur kosong.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membersihkan data' });
  }
});

// =================================================================
//  GET /api/iot/notifications — Notifikasi sistem & status
// =================================================================
router.get('/notifications', requireAuth, (req, res) => {
  try {
    cleanupExpiredCommands();
    const devices = readJSON(DEVICES_FILE, {});
    const dev = devices['esp32-ecosort-1'] || Object.values(devices)[0];
    const log = readJSON(COMMAND_LOG_FILE, []);
    const notifs = [];

    const now = Date.now();
    let isOnline = false;
    let isFull = false;
    let isSensorError = false;

    if (dev) {
      const lastSeenMs = new Date(dev.lastSeen || 0).getTime();
      isOnline = (now - lastSeenMs) < ONLINE_TIMEOUT_MS;
      if (dev.distanceCm === null || dev.distanceCm === undefined) {
        isSensorError = true;
      } else if (dev.distanceCm <= (dev.fullThresholdCm || 10)) {
        isFull = true;
      }
    }

    if (!isOnline) {
      notifs.push({
        id: 'notif-offline',
        type: 'warning',
        icon: 'wifi_off',
        title: 'Perangkat Offline',
        message: 'esp32-ecosort-1 belum terhubung atau data terakhir melebihi 10 detik.',
        time: 'Baru saja',
        unread: true
      });
    }

    if (isFull) {
      notifs.push({
        id: 'notif-full',
        type: 'danger',
        icon: 'delete',
        title: 'Tong Sampah Penuh!',
        message: `Kapasitas telah mencapai batas maksimal (${dev.distanceCm} cm). Segera kosongkan bak sampah.`,
        time: 'Penting',
        unread: true
      });
    }

    if (isSensorError && isOnline) {
      notifs.push({
        id: 'notif-sensor',
        type: 'danger',
        icon: 'error',
        title: 'Sensor Jarak Error',
        message: 'Sensor HC-SR04 mengalami timeout pembacaan jarak.',
        time: 'Baru saja',
        unread: true
      });
    }

    const surroundingTrash = Number(dev?.surroundingTrashCount ?? 0);
    if (surroundingTrash > 5) {
      notifs.push({
        id: 'notif-trash-high',
        type: 'danger',
        icon: 'warning',
        title: '🚨 Peringatan Petugas Kebersihan!',
        message: `Kamera AI CCTV mendeteksi sekitar ${surroundingTrash} sampah berserakan di sekitar tong (radius 2m). Status: Kotor. Peringatan telah dikirim ke petugas kebersihan untuk pembersihan darurat.`,
        time: 'Penting',
        unread: true
      });
    } else if (surroundingTrash >= 1) {
      notifs.push({
        id: 'notif-trash-warn',
        type: 'warning',
        icon: 'info',
        title: 'Sampah Sekitar Terdeteksi',
        message: `Kamera AI CCTV mendeteksi perkiraan ${surroundingTrash} sampah di sekitar tong (radius <= 2 meter). Sampah jalan raya diabaikan.`,
        time: 'Baru saja',
        unread: true
      });
    }

    if (log && log.length > 0) {
      const lastCmd = log[log.length - 1];
      const cmdName = lastCmd.type === 'tare' ? 'Tare Timbangan' : lastCmd.type === 'restart' ? 'Restart ESP32' : lastCmd.type;
      const statusIndo = lastCmd.status === 'delivered' ? 'Selesai dieksekusi ESP32' : lastCmd.status === 'expired' ? 'Kedaluwarsa (2 menit)' : 'Menunggu antrean';
      notifs.push({
        id: 'notif-cmd-' + lastCmd.id,
        type: 'info',
        icon: 'build',
        title: `Perintah: ${cmdName}`,
        message: `Status perintah: ${statusIndo}.`,
        time: 'Hari ini',
        unread: false
      });
    }

    notifs.push({
      id: 'notif-sys',
      type: 'success',
      icon: 'check_circle',
      title: 'EcoSort IoT Siap',
      message: 'Sistem monitoring mikrokontroler aktif dan tersinkronisasi.',
      time: 'Hari ini',
      unread: false
    });

    // Cek daftar notifikasi yang sudah dibaca pengguna
    const readIds = readJSON(READ_NOTIFS_FILE, []);
    notifs.forEach(n => {
      if (readIds.includes(n.id)) {
        n.unread = false;
      }
    });

    // Filter notifikasi yang telah dihapus pengguna
    const dismissedIds = readJSON(DISMISSED_NOTIFS_FILE, []);
    const activeNotifs = notifs.filter(n => !dismissedIds.includes(n.id));

    const unreadCount = activeNotifs.filter(n => n.unread).length;
    res.json({ notifications: activeNotifs, unreadCount });
  } catch (err) {
    res.json({ notifications: [], unreadCount: 0 });
  }
});

// =================================================================
//  POST /api/iot/notifications/read-all — Tandai semua notifikasi dibaca
// =================================================================
router.post('/notifications/read-all', requireAuth, (req, res) => {
  try {
    const { ids } = req.body || {};
    const existing = readJSON(READ_NOTIFS_FILE, []);
    const merged = Array.from(new Set([...existing, ...(Array.isArray(ids) ? ids : [])]));
    writeJSON(READ_NOTIFS_FILE, merged);
    res.json({ ok: true, count: merged.length });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

// =================================================================
//  POST /api/iot/notifications/read — Tandai satu notifikasi dibaca
// =================================================================
router.post('/notifications/read', requireAuth, (req, res) => {
  try {
    const { id } = req.body || {};
    if (id) {
      const existing = readJSON(READ_NOTIFS_FILE, []);
      if (!existing.includes(id)) {
        existing.push(id);
        writeJSON(READ_NOTIFS_FILE, existing);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

// =================================================================
//  DELETE /api/iot/notifications — Hapus seluruh notifikasi
// =================================================================
router.delete('/notifications', requireAuth, (req, res) => {
  try {
    const log = readJSON(COMMAND_LOG_FILE, []);
    const allIds = ['notif-offline', 'notif-full', 'notif-sensor', 'notif-trash-high', 'notif-trash-warn', 'notif-sys'];
    if (Array.isArray(log)) log.forEach(l => allIds.push('notif-cmd-' + l.id));
    const existing = readJSON(DISMISSED_NOTIFS_FILE, []);
    const merged = Array.from(new Set([...existing, ...allIds]));
    writeJSON(DISMISSED_NOTIFS_FILE, merged);
    res.json({ ok: true, message: 'Seluruh notifikasi dibersihkan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus notifikasi' });
  }
});

// =================================================================
//  DELETE /api/iot/notifications/:id — Hapus satu notifikasi
// =================================================================
router.delete('/notifications/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    if (id) {
      const existing = readJSON(DISMISSED_NOTIFS_FILE, []);
      if (!existing.includes(id)) {
        existing.push(id);
        writeJSON(DISMISSED_NOTIFS_FILE, existing);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus notifikasi' });
  }
});

module.exports = router;
