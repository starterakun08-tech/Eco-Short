// ============================================================
//  AI routes — Asisten cerdas pemantauan data IoT EcoSort
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

// Helper JSON reader
function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return fallback;
}

// Kumpulkan data terkini sensor untuk konteks AI
function getLiveContext() {
  const devices = readJSON(DEVICES_FILE, {});
  const dev = devices['esp32-ecosort-1'] || Object.values(devices)[0] || {
    deviceId: 'esp32-ecosort-1',
    weightGram: 0,
    totalWeightGram: 0,
    currentWeightGram: 0,
    distanceCm: 25,
    fullThresholdCm: 10,
    emptyDistanceCm: 35,
    lastSeen: new Date().toISOString()
  };

  const now = Date.now();
  const lastSeenMs = new Date(dev.lastSeen || 0).getTime();
  const isOnline = (now - lastSeenMs) < 10000;

  const dist = dev.distanceCm;
  const fullThresh = dev.fullThresholdCm || 10;
  const emptyDist = dev.emptyDistanceCm || 35;

  let fillPercent = 0;
  let statusText = 'AMAN';
  if (dist === null || dist === undefined) {
    statusText = 'SENSOR ERROR';
    fillPercent = 0;
  } else if (dist <= fullThresh) {
    statusText = 'PENUH';
    fillPercent = 100;
  } else {
    statusText = 'AMAN';
    const denom = (emptyDist - fullThresh) || 1;
    const num = emptyDist - dist;
    fillPercent = Math.min(100, Math.max(0, Math.round((num / denom) * 100)));
  }

  const txs = readJSON(TRANSACTIONS_FILE, []).slice(0, 5);

  return {
    deviceId: dev.deviceId || 'esp32-ecosort-1',
    isOnline,
    lastSeen: dev.lastSeen,
    currentWeightGram: dev.currentWeightGram ?? dev.weightGram ?? 0,
    totalWeightGram: dev.totalWeightGram ?? 0,
    distanceCm: dist,
    fullThresholdCm: fullThresh,
    emptyDistanceCm: emptyDist,
    fillPercent,
    statusText,
    recentEvents: txs
  };
}

// Jawaban aturan cerdas otomatis (berfungsi jika API key belum diisi atau fallback)
function generateSmartReply(userMessage, ctx) {
  const q = (userMessage || '').toLowerCase();

  const weightStr = `${Number(ctx.currentWeightGram).toFixed(1)} gram`;
  const totalWeightStr = ctx.totalWeightGram >= 1000 
    ? `${(ctx.totalWeightGram / 1000).toFixed(2)} kg` 
    : `${Number(ctx.totalWeightGram).toFixed(1)} gram`;
  const distStr = ctx.distanceCm !== null ? `${Number(ctx.distanceCm).toFixed(1)} cm` : 'Error (tidak terbaca)';
  const onlineStr = ctx.isOnline ? 'Online (Terhubung)' : 'Offline (Terputus)';

  if (q.includes('penuh') || q.includes('kapasitas') || q.includes('level') || q.includes('isi')) {
    if (ctx.statusText === 'PENUH') {
      return `🚨 **Status: Tong Sampah Penuh!**\nTingkat isi saat ini sudah **${ctx.fillPercent}%** dengan jarak sensor **${distStr}** (batas penuh: ${ctx.fullThresholdCm} cm). Segera kosongkan penampungan untuk mencegah tumpahan sampah.`;
    }
    return `✅ **Status: Masih Aman**\nTingkat kepenuhan tong saat ini **${ctx.fillPercent}%** (jarak sensor: **${distStr}**, batas penuh: ${ctx.fullThresholdCm} cm). Tong sampah masih bisa menampung sampah baru.`;
  }

  if (q.includes('berat') || q.includes('timbangan') || q.includes('gram') || q.includes('kg')) {
    return `⚖️ **Data Penimbangan Terkini:**\n- Berat sensor saat ini: **${weightStr}**\n- Total akumulasi berat: **${totalWeightStr}**\nSensor load cell HX711 membaca secara live dengan titik kalibrasi aktif.`;
  }

  if (q.includes('ringkas') || q.includes('rekap') || q.includes('rangkum') || q.includes('laporan')) {
    return `📊 **Ringkasan Data EcoSort IoT Hari Ini:**\n- **Status Alat:** ${onlineStr}\n- **Kondisi Tong:** ${ctx.statusText} (${ctx.fillPercent}% terisi)\n- **Berat Sampah Sekarang:** ${weightStr}\n- **Total Berat Terkumpul:** ${totalWeightStr}\n- **Jarak Sensor Ultrasonik:** ${distStr}\n- **Jumlah Kejadian Riwayat:** ${ctx.recentEvents.length} transaksi tercatat.`;
  }

  if (q.includes('status') || q.includes('perangkat') || q.includes('alat') || q.includes('esp32') || q.includes('online')) {
    return `📡 **Status Perangkat ESP32:**\n- ID Perangkat: **${ctx.deviceId}**\n- Status Koneksi: **${onlineStr}**\n- Terakhir Terlihat: ${ctx.lastSeen ? new Date(ctx.lastSeen).toLocaleTimeString('id-ID') : '-'}\n- Keadaan Sensor: Jarak ${distStr}, Berat ${weightStr}.`;
  }

  return `🤖 **Asisten EcoSort IoT:**\nBerdasarkan data sensor terkini dari **${ctx.deviceId}**:\n- Status: **${ctx.statusText}** (${ctx.fillPercent}% terisi)\n- Berat: **${weightStr}** (Total: **${totalWeightStr}**)\n- Koneksi: **${onlineStr}**\n\nSilakan tanyakan pertanyaan lain seputar kapasitas tong, berat, atau perintah perangkat!`;
}

// ---- POST /api/ai/chat ----
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Pesan pertanyaan tidak boleh kosong' });
    }

    const ctx = getLiveContext();
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

    // Jika API Key belum dikonfigurasi di environment server
    if (!apiKey) {
      const fallback = generateSmartReply(message, ctx);
      return res.json({
        configured: false,
        message: 'AI belum dikonfigurasi. Silakan isi GEMINI_API_KEY di environment variable panel hosting.',
        reply: fallback,
        context: ctx
      });
    }

    // Panggil Google Gemini API
    const prompt = `Anda adalah asisten AI pintar untuk sistem tong sampah cerdas "EcoSort IoT" (ESP32).
Berikut data terkini dari perangkat:
- ID Perangkat: ${ctx.deviceId}
- Status Koneksi: ${ctx.isOnline ? 'Online' : 'Offline'}
- Berat Sampah Sekarang: ${ctx.currentWeightGram} gram
- Total Akumulasi Berat: ${ctx.totalWeightGram} gram
- Jarak Sensor Ultrasonik: ${ctx.distanceCm !== null ? ctx.distanceCm + ' cm' : 'Sensor Error'}
- Batas Penuh: ${ctx.fullThresholdCm} cm, Jarak Kosong: ${ctx.emptyDistanceCm} cm
- Persentase Kapasitas: ${ctx.fillPercent}%
- Status Tong: ${ctx.statusText}

Jawab pertanyaan pengguna berikut secara ringkas, ramah, akurat, dan dalam Bahasa Indonesia:
"${message}"`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ]
      })
    });

    if (!response.ok) {
      console.warn('[AI/chat] Gemini API returned error status:', response.status);
      const fallback = generateSmartReply(message, ctx);
      return res.json({
        configured: true,
        reply: fallback,
        context: ctx
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return res.json({
        configured: true,
        reply: text,
        context: ctx
      });
    } else {
      const fallback = generateSmartReply(message, ctx);
      return res.json({
        configured: true,
        reply: fallback,
        context: ctx
      });
    }
  } catch (err) {
    console.error('[AI/chat] Error:', err.message);
    const ctx = getLiveContext();
    const fallback = generateSmartReply(req.body?.message || '', ctx);
    res.json({
      configured: false,
      message: 'AI fallback aktif',
      reply: fallback,
      context: ctx
    });
  }
});

// ---- GET /api/ai/status ----
router.get('/status', requireAuth, (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  res.json({
    configured: Boolean(apiKey && apiKey.length > 5),
    model: 'gemini-1.5-flash'
  });
});

module.exports = router;
