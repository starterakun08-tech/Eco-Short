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
      const txs = readJSON(TRANSACTIONS_FILE, []);
      const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                     new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      const addedWeight = body.weightGram || body.currentWeightGram || 0;
      txs.unshift({
        id: '#' + Math.floor(2024000 + Math.random() * 1000),
        date: nowStr,
        amount: `+${Number(addedWeight).toFixed(1)} g`,
        rawAmount: `+${Number(addedWeight).toFixed(1)} g`,
        status: 'Selesai'
      });
      if (txs.length > 50) txs.pop();
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
    const txs = readJSON(TRANSACTIONS_FILE, []);
    const nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                   new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const cmdLabel = cmd.type === 'tare' ? 'Tare Nol Timbangan' : cmd.type === 'restart' ? 'Restart Mikrokontroler' : `${cmd.type}: ${cmd.params?.value || ''}`;
    txs.unshift({
      id: '#' + Math.floor(2024000 + Math.random() * 1000),
      date: nowStr,
      amount: cmdLabel,
      rawAmount: cmdLabel,
      status: 'Menunggu'
    });
    if (txs.length > 50) txs.pop();
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
    const txs = readJSON(TRANSACTIONS_FILE, []);
    res.json({ transactions: txs.slice(0, 10) });
  } catch (err) {
    res.json({ transactions: [] });
  }
});

// =================================================================
//  GET /api/iot/notifications — Notifikasi nyata perangkat & sistem
// =================================================================
router.get('/notifications', requireAuth, (req, res) => {
  try {
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
        message: 'esp32-ecosort-1 tidak mengirim data lebih dari 10 detik. Periksa daya atau koneksi WiFi.',
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

    // Notifikasi perintah terakhir
    if (log && log.length > 0) {
      const lastCmd = log[log.length - 1];
      const cmdName = lastCmd.type === 'tare' ? 'Tare Timbangan' : lastCmd.type === 'restart' ? 'Restart ESP32' : lastCmd.type;
      notifs.push({
        id: 'notif-cmd-' + lastCmd.id,
        type: 'info',
        icon: 'build',
        title: `Perintah: ${cmdName}`,
        message: `Status perintah: ${lastCmd.status === 'delivered' ? 'Selesai dieksekusi ESP32' : 'Menunggu antrean'}.`,
        time: 'Hari ini',
        unread: false
      });
    }

    // Notifikasi sistem standby
    notifs.push({
      id: 'notif-sys',
      type: 'success',
      icon: 'check_circle',
      title: 'EcoSort IoT Siap',
      message: 'Sistem monitoring mikrokontroler aktif dan tersinkronisasi.',
      time: 'Hari ini',
      unread: false
    });

    const unreadCount = notifs.filter(n => n.unread).length;
    res.json({ notifications: notifs, unreadCount });
  } catch (err) {
    res.json({ notifications: [], unreadCount: 0 });
  }
});

module.exports = router;

