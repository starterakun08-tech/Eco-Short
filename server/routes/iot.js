// ============================================================
//  IoT routes — terima data ESP, kirim perintah, riwayat
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { requireAuth, requireDeviceToken } = require('../middleware/auth');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
const COMMAND_LOG_FILE = path.join(DATA_DIR, 'command_log.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

const MAX_HISTORY_PER_DEVICE = 500;
const ONLINE_TIMEOUT_MS = 10000; // 10 detik (online jika data < 10 detik)

// ---- Helpers ----
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

// =================================================================
//  POST /api/iot/data — ESP mengirim data sensor
// =================================================================
router.post('/data', requireDeviceToken, (req, res) => {
  try {
    const body = req.body;
    const deviceId = body.deviceId;
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });

    const now = new Date().toISOString();

    // --- Simpan status perangkat terbaru ---
    const devices = readJSON(DEVICES_FILE, {});
    devices[deviceId] = {
      deviceId,
      lastSeen: now,
      weightGram: body.weightGram ?? 0,
      totalWeightGram: body.totalWeightGram ?? 0,
      pendingWeightGram: body.pendingWeightGram ?? 0,
      currentWeightGram: body.currentWeightGram ?? 0,
      distanceCm: body.distanceCm ?? null,
      fullThresholdCm: body.fullThresholdCm ?? 10,
      emptyDistanceCm: body.emptyDistanceCm ?? 35,
      resetWeight: body.resetWeight ?? false
    };
    writeJSON(DEVICES_FILE, devices);

    // --- Tambah ke riwayat ---
    const history = readJSON(HISTORY_FILE, {});
    if (!history[deviceId]) history[deviceId] = [];
    history[deviceId].push({
      t: now,
      w: body.weightGram ?? 0,
      tw: body.totalWeightGram ?? 0,
      d: body.distanceCm ?? null
    });
    // Batasi jumlah riwayat
    if (history[deviceId].length > MAX_HISTORY_PER_DEVICE) {
      history[deviceId] = history[deviceId].slice(-MAX_HISTORY_PER_DEVICE);
    }
    writeJSON(HISTORY_FILE, history);

    // --- Catat transaksi penimbangan jika ada berat baru terakumulasi ---
    if (body.resetWeight && (body.weightGram > 0 || body.currentWeightGram > 0)) {
      const txs = readJSON(TRANSACTIONS_FILE, null) || [
        { id: '#2020912', date: 'Apr 29, 2024, 11:37', amount: '-$299.89', rawAmount: '+245.5 g', status: 'Pending' },
        { id: '#2020911', date: 'Apr 29, 2024, 11:37', amount: '-$130.15', rawAmount: '+130.2 g', status: 'Completed' },
        { id: '#2020910', date: 'Apr 29, 2024, 11:36', amount: '-$458.13', rawAmount: 'Tare 0.0 g', status: 'Scheduled' },
        { id: '#2020909', date: 'Apr 29, 2024, 11:36', amount: '-$210.99', rawAmount: '+210.0 g', status: 'Completed' }
      ];
      const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
                     new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const addedWeight = body.weightGram || body.currentWeightGram || 0;
      txs.unshift({
        id: '#' + Math.floor(2020000 + Math.random() * 1000),
        date: nowStr,
        amount: `-$${(addedWeight * 1.25).toFixed(2)}`,
        rawAmount: `+${Number(addedWeight).toFixed(1)} g`,
        status: 'Completed'
      });
      if (txs.length > 30) txs.pop();
      writeJSON(TRANSACTIONS_FILE, txs);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[IOT/data] Error:', err.message);
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// =================================================================
//  GET /api/iot/commands?deviceId=xxx — ESP mengambil perintah
// =================================================================
router.get('/commands', requireDeviceToken, (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    if (!deviceId) return res.status(400).json({ error: 'deviceId diperlukan' });

    const commands = readJSON(COMMANDS_FILE, {});
    const pending = commands[deviceId] || [];

    // Kosongkan antrean setelah diambil
    if (pending.length > 0) {
      commands[deviceId] = [];
      writeJSON(COMMANDS_FILE, commands);

      // Catat bahwa perintah sudah diambil
      const log = readJSON(COMMAND_LOG_FILE, []);
      for (const cmd of pending) {
        const entry = log.find(l => l.id === cmd.id);
        if (entry) {
          entry.status = 'delivered';
          entry.deliveredAt = new Date().toISOString();
        }
      }
      writeJSON(COMMAND_LOG_FILE, log);
    }

    res.json({ commands: pending });
  } catch (err) {
    console.error('[IOT/commands] Error:', err.message);
    res.json({ commands: [] });
  }
});

// =================================================================
//  POST /api/iot/command — Dashboard mengirim perintah ke ESP
// =================================================================
router.post('/command', requireAuth, (req, res) => {
  try {
    const { deviceId, type, params } = req.body;
    if (!deviceId || !type) {
      return res.status(400).json({ error: 'deviceId dan type diperlukan' });
    }

    const validTypes = ['tare', 'set_calibration', 'set_interval', 'restart'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipe perintah tidak valid: ' + type });
    }

    const cmd = {
      id: uuidv4(),
      type,
      params: params || {},
      createdAt: new Date().toISOString()
    };

    // Tambah ke antrean perintah
    const commands = readJSON(COMMANDS_FILE, {});
    if (!commands[deviceId]) commands[deviceId] = [];
    commands[deviceId].push(cmd);
    writeJSON(COMMANDS_FILE, commands);

    // Catat di log perintah
    const log = readJSON(COMMAND_LOG_FILE, []);
    log.push({
      id: cmd.id,
      deviceId,
      type: cmd.type,
      params: cmd.params,
      createdAt: cmd.createdAt,
      status: 'pending'
    });
    // Simpan 50 terakhir saja
    if (log.length > 50) log.splice(0, log.length - 50);
    writeJSON(COMMAND_LOG_FILE, log);

    // Catat juga ke Recent Transactions
    const txs = readJSON(TRANSACTIONS_FILE, null) || [
      { id: '#2020912', date: 'Apr 29, 2024, 11:37', amount: '-$299.89', rawAmount: '+245.5 g', status: 'Pending' },
      { id: '#2020911', date: 'Apr 29, 2024, 11:37', amount: '-$130.15', rawAmount: '+130.2 g', status: 'Completed' },
      { id: '#2020910', date: 'Apr 29, 2024, 11:36', amount: '-$458.13', rawAmount: 'Tare 0.0 g', status: 'Scheduled' },
      { id: '#2020909', date: 'Apr 29, 2024, 11:36', amount: '-$210.99', rawAmount: '+210.0 g', status: 'Completed' }
    ];
    const nowStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
                   new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const cmdLabel = cmd.type === 'tare' ? 'Tare Nol' : cmd.type === 'restart' ? 'Restart ESP' : `${cmd.type}: ${cmd.params?.value || ''}`;
    txs.unshift({
      id: '#' + Math.floor(2020000 + Math.random() * 1000),
      date: nowStr,
      amount: `-$${(Math.random() * 300 + 50).toFixed(2)}`,
      rawAmount: cmdLabel,
      status: 'Pending'
    });
    if (txs.length > 30) txs.pop();
    writeJSON(TRANSACTIONS_FILE, txs);

    res.json({ status: 'queued', command: cmd });
  } catch (err) {
    console.error('[IOT/command] Error:', err.message);
    res.status(500).json({ error: 'Gagal mengirim perintah' });
  }
});

// =================================================================
//  GET /api/iot/devices — Dashboard mengambil daftar perangkat
// =================================================================
router.get('/devices', requireAuth, (req, res) => {
  try {
    const devices = readJSON(DEVICES_FILE, {});
    const now = Date.now();
    const result = [];

    for (const [id, dev] of Object.entries(devices)) {
      const lastSeen = new Date(dev.lastSeen).getTime();
      const online = (now - lastSeen) < ONLINE_TIMEOUT_MS;
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
//  GET /api/iot/command-log — Dashboard mengambil log perintah
// =================================================================
router.get('/command-log', requireAuth, (req, res) => {
  try {
    const log = readJSON(COMMAND_LOG_FILE, []);
    res.json({ log: log.slice(-20).reverse() });
  } catch (err) {
    res.json({ log: [] });
  }
});

// =================================================================
//  GET /api/iot/transactions — Riwayat transaksi (tabel Recent Transaction)
// =================================================================
router.get('/transactions', requireAuth, (req, res) => {
  try {
    const txs = readJSON(TRANSACTIONS_FILE, null) || [
      { id: '#2020912', date: 'Apr 29, 2024, 11:37', amount: '-$299.89', rawAmount: '+245.5 g', status: 'Pending' },
      { id: '#2020911', date: 'Apr 29, 2024, 11:37', amount: '-$130.15', rawAmount: '+130.2 g', status: 'Completed' },
      { id: '#2020910', date: 'Apr 29, 2024, 11:36', amount: '-$458.13', rawAmount: 'Tare 0.0 g', status: 'Scheduled' },
      { id: '#2020909', date: 'Apr 29, 2024, 11:36', amount: '-$210.99', rawAmount: '+210.0 g', status: 'Completed' }
    ];
    res.json({ transactions: txs.slice(0, 10) });
  } catch (err) {
    res.json({ transactions: [] });
  }
});

module.exports = router;

