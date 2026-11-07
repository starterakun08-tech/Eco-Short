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
    devices[deviceId] = {
      deviceId,
      lastSeen: now,
      weightGram: body.weightGram ?? 0,
      totalWeightGram: body.totalWeightGram ?? 0,
      currentWeightGram: body.currentWeightGram ?? body.weightGram ?? 0,
      distanceCm: body.distanceCm ?? null,
      fullThresholdCm: body.fullThresholdCm ?? 10,
      emptyDistanceCm: body.emptyDistanceCm ?? 35
    };
    writeJSON(DEVICES_FILE, devices);

    // --- Simpan Riwayat Sensor ---
    const history = readJSON(HISTORY_FILE, {});
    if (!history[deviceId]) history[deviceId] = [];
    history[deviceId].push({
      t: now,
      w: body.currentWeightGram ?? body.weightGram ?? 0,
      tw: body.totalWeightGram ?? 0,
      d: body.distanceCm ?? null
    });
    if (history[deviceId].length > MAX_HISTORY_PER_DEVICE) {
      history[deviceId] = history[deviceId].slice(-MAX_HISTORY_PER_DEVICE);
    }
    writeJSON(HISTORY_FILE, history);

    // --- Catat kejadian penimbangan jika ada berat terakumulasi ---
    if (body.resetWeight && (body.weightGram > 0 || body.currentWeightGram > 0)) {
      const txs = readJSON(TRANSACTIONS_FILE, []);
      const nowObj = new Date();
      const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                     nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      const addedWeight = body.weightGram || body.currentWeightGram || 0;
      txs.unshift({
        id: '#' + Math.floor(2024000 + Math.random() * 1000),
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

    const validTypes = ['tare', 'set_calibration', 'set_interval', 'restart'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipe perintah tidak valid: ' + type });
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
    const cmdLabel = cmd.type === 'tare' ? 'Tare Nol Timbangan' : cmd.type === 'restart' ? 'Restart ESP32' : `${cmd.type}: ${cmd.params?.value || ''}`;

    txs.unshift({
      id: '#' + Math.floor(2024000 + Math.random() * 1000),
      commandId: cmd.id,
      date: nowStr,
      timestamp: cmd.createdAt,
      type: 'Perintah',
      amount: cmdLabel,
      rawAmount: cmdLabel,
      distance: '--',
      status: 'Menunggu' // Tetap 'Menunggu' sampai diambil ESP32
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
    res.json({ transactions: txs.slice(0, 100) });
  } catch (err) {
    res.json({ transactions: [] });
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

    const historyAll = readJSON(HISTORY_FILE, {});
    const list = historyAll[deviceId] || [];
    const txs = readJSON(TRANSACTIONS_FILE, []);

    // Pisahkan transaksi penimbangan dan perintah
    const weighingTxs = txs.filter(t => t.type === 'Penimbangan' || (!t.commandId && t.type !== 'Perintah'));
    const commandTxs = txs.filter(t => t.type === 'Perintah' || Boolean(t.commandId));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    const todayData = list.filter(item => {
      const t = new Date(item.t).getTime();
      return t >= startOfToday;
    });

    const yesterdayData = list.filter(item => {
      const t = new Date(item.t).getTime();
      return t >= startOfYesterday && t < startOfToday;
    });

    // Buat slot jam (kelipatan 2 jam: 00:00, 02:00, ... 22:00)
    const hourlyLabels = [];
    const hourlyWeights = [];
    const hourlyCapacities = [];
    const yesterdayWeights = [];

    for (let h = 0; h < 24; h += 2) {
      const hStr = String(h).padStart(2, '0') + ':00';
      hourlyLabels.push(hStr);

      const hStart = startOfToday + h * 3600000;
      const hEnd = hStart + 2 * 3600000;

      const matches = todayData.filter(d => {
        const t = new Date(d.t).getTime();
        return t >= hStart && t < hEnd;
      });

      if (matches.length > 0) {
        const avgW = matches.reduce((acc, c) => acc + (c.w || 0), 0) / matches.length;
        hourlyWeights.push(Number(avgW.toFixed(1)));

        const avgD = matches.reduce((acc, c) => acc + (c.d || 35), 0) / matches.length;
        const fillPct = Math.min(100, Math.max(0, Math.round(((35 - avgD) / 25) * 100)));
        hourlyCapacities.push(fillPct);
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

    // Hitung rata-rata dan puncak HANYA dari kejadian penimbangan
    const weighingAmounts = weighingTxs.map(t => {
      const match = String(t.amount || t.rawAmount || '').match(/([0-9.]+)/);
      return match ? parseFloat(match[1]) : 0;
    }).filter(w => w > 0);

    const weightsRecorded = weighingAmounts.length > 0
      ? weighingAmounts
      : todayData.map(d => d.w || 0).filter(w => w > 0);

    const avgWeight = weightsRecorded.length > 0
      ? (weightsRecorded.reduce((a, b) => a + b, 0) / weightsRecorded.length).toFixed(1)
      : '0.0';
    const peakWeight = weightsRecorded.length > 0
      ? Math.max(...weightsRecorded).toFixed(1)
      : '0.0';

    // Jam tersibuk dihitung HANYA dari kejadian penimbangan:
    const hourCounts = {};
    for (const t of weighingTxs) {
      if (t.timestamp) {
        const h = new Date(t.timestamp).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
    }
    let busiestHour = '--';
    let maxHourCount = 0;
    for (const [h, count] of Object.entries(hourCounts)) {
      if (count > maxHourCount) {
        maxHourCount = count;
        busiestHour = `${String(h).padStart(2, '0')}:00 - ${String(Number(h)+1).padStart(2, '0')}:00`;
      }
    }

    const hasYesterdayData = yesterdayWeights.some(v => v !== null);

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
        weighingEvents: weighingTxs.length,
        commandEvents: commandTxs.length,
        totalEvents: weighingTxs.length, // Frekuensi Buang = penimbangan
        busiestHour: busiestHour !== '--' ? busiestHour : 'Belum Terdeteksi'
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
      const id = (t.id || '').replace(/"/g, '""');
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
      weightGram: 245.5,
      totalWeightGram: 1820.0,
      currentWeightGram: 245.5,
      distanceCm: 21.4,
      fullThresholdCm: 10,
      emptyDistanceCm: 35
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

    // 4 Transaksi demo (kejadian nyata)
    const txs = [
      {
        id: '#2024528',
        date: 'Hari ini, 14.05',
        timestamp: new Date(now - 1200000).toISOString(),
        type: 'Penimbangan',
        amount: '+245.5 g',
        rawAmount: '+245.5 g',
        distance: '21.4 cm',
        status: 'Selesai'
      },
      {
        id: '#2024527',
        date: 'Hari ini, 13.50',
        timestamp: new Date(now - 2100000).toISOString(),
        type: 'Perintah',
        amount: 'Tare Nol Timbangan',
        rawAmount: 'Tare Nol Timbangan',
        distance: '--',
        status: 'Selesai'
      },
      {
        id: '#2024526',
        date: 'Hari ini, 13.15',
        timestamp: new Date(now - 4200000).toISOString(),
        type: 'Penimbangan',
        amount: '+130.2 g',
        rawAmount: '+130.2 g',
        distance: '23.0 cm',
        status: 'Selesai'
      },
      {
        id: '#2024525',
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

    const unreadCount = notifs.filter(n => n.unread).length;
    res.json({ notifications: notifs, unreadCount });
  } catch (err) {
    res.json({ notifications: [], unreadCount: 0 });
  }
});

module.exports = router;
