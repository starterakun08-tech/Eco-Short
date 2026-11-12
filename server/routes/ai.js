// ============================================================
//  AI routes — Asisten cerdas pemantauan data IoT EcoSort
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const { requireAuth, getDeviceToken, parseCookies } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const LATEST_CCTV_FILE = path.join(DATA_DIR, 'latest_cctv.json');
const LATEST_CCTV_IMG = path.join(DATA_DIR, 'latest_cctv.jpg');

// Helper JSON reader & writer
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

// Helper autentikasi fleksibel: mendukung sesi Web (JWT) ATAU token perangkat kamera CCTV
function requireAuthOrDeviceToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookies = parseCookies(req);
  if ((authHeader && authHeader.startsWith('Bearer ')) || (cookies && cookies.ecosort_token)) {
    return requireAuth(req, res, next);
  }

  const devToken = req.headers['x-device-token'] || req.query.token || req.body?.deviceToken;
  const expected = getDeviceToken();
  if (devToken && expected && devToken === expected) {
    req.user = { role: 'device', username: 'cctv_flutter_app' };
    return next();
  }

  // Jika tidak ada header, default requireAuth
  return requireAuth(req, res, next);
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

// Jawaban cerdas otomatis yang memahami konteks prompt pengguna secara alami
function generateSmartReply(userMessage, ctx) {
  const q = (userMessage || '').trim().toLowerCase();

  const weightStr = `${Number(ctx.currentWeightGram).toFixed(1)} gram`;
  const totalWeightStr = ctx.totalWeightGram >= 1000 
    ? `${(ctx.totalWeightGram / 1000).toFixed(2)} kg` 
    : `${Number(ctx.totalWeightGram).toFixed(1)} gram`;
  const distStr = ctx.distanceCm !== null ? `${Number(ctx.distanceCm).toFixed(1)} cm` : 'Error (tidak terbaca)';
  const onlineStr = ctx.isOnline ? 'Online (Terhubung)' : 'Offline (Terputus)';

  // 1. Sapaan & Salam (hi, halo, hello, p, pp, tes, dll)
  if (/^(hi|hai|halo|hello|hey|hei|p|pp|tes|test|pagi|siang|sore|malam)[\s!.?]*$/i.test(q) || q.startsWith('halo') || q.startsWith('hai ')) {
    return `Halo! 👋 Ada yang bisa saya bantu terkait sistem **EcoSort IoT** hari ini?\n\nAnda dapat menanyakan:\n- **Kapasitas & status isi** tong sampah saat ini\n- **Berat timbangan terkini** & total sampah terkumpul\n- **Status kebersihan sekitar** dari kamera CCTV AI\n- **Kontrol & perintah** mikrokontroler ESP32`;
  }

  // 2. Pertanyaan tentang Foto Profil / PP / Banner Akun
  if (q.includes('pp') || q.includes('foto profil') || q.includes('avatar') || q.includes('banner') || q.includes('background')) {
    return `Untuk mengganti **Foto Profil (PP)** atau **Banner Latar Belakang** akun:\n1. Klik menu **Akun** di bilah navigasi samping kiri, ATAU\n2. Klik ikon kamera kecil 📷 di sudut banner panel profil sebelah kanan.\nAnda dapat mengunggah file foto kustom (JPG, PNG) atau memilih tema warna gradasi yang tersedia!`;
  }

  // 3. Pertanyaan tentang CCTV & Kamera AI Lingkungan
  if (q.includes('cctv') || q.includes('kamera') || q.includes('radius') || q.includes('deteksi') || q.includes('lingkungan')) {
    return `📹 **Sistem Kamera CCTV Cerdas EcoSort:**\n- Memantau kebersihan area sekitar tong sampah khusus dalam **radius maksimal 2 meter** (sampah jauh di jalan raya diabaikan otomatis).\n- **3 Status Cerdas:**\n  🟢 **Bersih:** 0 sampah di sekitar tong.\n  🟡 **Waspada:** 1 - 5 sampah berserakan.\n  🔴 **Kotor:** > 5 sampah (otomatis kirim peringatan ke Petugas Kebersihan).\nAnda bisa memantau langsung dari menu **AI** di dashboard web atau memasang aplikasi Android CCTV EcoSort.`;
  }

  // 4. Pertanyaan tentang Kapasitas / Penuh / Level Isi
  if (q.includes('penuh') || q.includes('kapasitas') || q.includes('level') || q.includes('isi') || q.includes('volume') || q.includes('tinggi')) {
    if (ctx.statusText === 'PENUH' || ctx.fillPercent >= 80) {
      return `🚨 **Status: Tong Sampah Penuh (${ctx.fillPercent}%)!**\nJarak sensor volume saat ini **${distStr}** (batas penuh: ${ctx.fullThresholdCm} cm). Segera kosongkan penampungan untuk mencegah tumpahan sampah.`;
    }
    return `✅ **Status Kapasitas: Masih Aman**\nTingkat keterisian tong saat ini **${ctx.fillPercent}%** (jarak sensor: **${distStr}**, batas penuh: ${ctx.fullThresholdCm} cm). Tong sampah masih dapat menampung sampah baru.`;
  }

  // 5. Pertanyaan tentang Berat & Timbangan
  if (q.includes('berat') || q.includes('timbangan') || q.includes('gram') || q.includes('kg') || q.includes('tare') || q.includes('load cell')) {
    return `⚖️ **Data Penimbangan Terkini:**\n- Beban sensor saat ini: **${weightStr}**\n- Total akumulasi sampah: **${totalWeightStr}**\n- Status kalibrasi: Sensor load cell HX711 aktif.\n\n*Tip: Jika timbangan bergeser saat bak kosong, gunakan tombol **Reset Timbangan** di panel profil kanan untuk menolkan kembali.*`;
  }

  // 6. Ringkasan / Rekapitulasi / Laporan
  if (q.includes('ringkas') || q.includes('rekap') || q.includes('rangkum') || q.includes('laporan') || q.includes('analitik')) {
    return `📊 **Ringkasan Data EcoSort IoT Terkini:**\n- **Status Alat:** ${onlineStr}\n- **Kondisi Tong:** ${ctx.statusText} (${ctx.fillPercent}% terisi)\n- **Berat Sampah Sekarang:** ${weightStr}\n- **Total Akumulasi:** ${totalWeightStr}\n- **Jarak Sensor:** ${distStr}\n- **Kejadian Tercatat:** ${ctx.recentEvents.length} transaksi di riwayat sistem.`;
  }

  // 7. Status Perangkat & ESP32
  if (q.includes('status') || q.includes('perangkat') || q.includes('alat') || q.includes('esp32') || q.includes('online') || q.includes('koneksi')) {
    return `📡 **Status Perangkat ESP32 (${ctx.deviceId}):**\n- Status Koneksi: **${onlineStr}**\n- Terakhir Terlihat: ${ctx.lastSeen ? new Date(ctx.lastSeen).toLocaleTimeString('id-ID') : 'Belum ada data'}\n- Sensor Ultrasonik: ${distStr}\n- Timbangan Berat: ${weightStr} (Kapasitas: ${ctx.fillPercent}%).`;
  }

  // 8. Default Respons Cerdas Berbasis Prompt Pengguna
  return `Halo! Menanggapi pesan Anda mengenai "*${userMessage}*":\n\nSistem EcoSort IoT saat ini berstatus **${onlineStr}** dengan kapasitas isi **${ctx.fillPercent}%** dan berat sampah tercatat **${weightStr}**.\n\nJika ada yang ingin Anda pantau secara khusus, silakan tanyakan seperti:\n- *"Apakah tong sampah sudah penuh?"*\n- *"Berapa berat sampah saat ini?"*\n- *"Bagaimana status kamera CCTV lingkungan?"*`;
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

// =================================================================
//  FUNGSI ANALISIS GAMBAR CCTV (GEMINI VISION + FALLBACK VISION)
//  Catatan aturan:
//  - Hanya analisa radius <= 2 meter di sekitar tong sampah
//  - Sampah di tengah jalan raya / aspal jauh (>2m) diabaikan
//  - 0 sampah: Bersih (Hijau)
//  - 1-5 sampah: Waspada (Kuning)
//  - >5 sampah: Kotor (Merah) -> Kirim Peringatan Petugas Kebersihan
// =================================================================

async function callGeminiVision(apiKey, base64Data, mimeType = 'image/jpeg') {
  const promptText = `Anda adalah asisten AI computer vision untuk inspeksi kebersihan tong sampah cerdas EcoSort IoT.
Tugas Anda adalah memeriksa area sekitar tong sampah pada gambar kamera CCTV ini.

ATURAN DETEKSI KHUSUS & SANGAT PENTING:
1. RADIUS PENILAIAN HANYA MAKSIMAL 2 METER di sekeliling tong sampah.
2. SAMPAH DI LUAR RADIUS 2 METER (contohnya: jika tampak sampah jauh di seberang atau di tengah jalan raya/aspal) JANGAN DIHITUNG SAMA SEKALI (harus diabaikan).
3. Periksa apakah ada sampah yang terjatuh, tumpah, atau berserakan di sekitar tong sampah (radius <= 2 meter).
4. Hitung perkiraan jumlah objek sampah yang berserakan (hanya dalam radius 2 meter).
5. Klasifikasikan status kebersihan lingkungan:
   - 0 sampah: status "Bersih", statusColor "green"
   - 1 sampai 5 sampah: status "Waspada", statusColor "yellow", sebutkan perkiraan jumlah sampah
   - Lebih dari 5 sampah (>5): status "Kotor", statusColor "red", sebutkan perkiraan jumlah sampah, dan aktifkan peringatan ke Petugas Kebersihan.

Kembalikan HANYA format JSON valid berikut (tanpa markdown tambahan seperti \`\`\`json):
{
  "detectedTrashCount": <angka perkiraan jumlah sampah dalam radius 2m>,
  "status": "Bersih" | "Waspada" | "Kotor",
  "statusColor": "green" | "yellow" | "red",
  "summary": "<penjelasan ringkas kondisi sampah di sekitar tong>",
  "trashItems": ["<nama/jenis sampah yang terdeteksi, misal: botol plastik, gelas plastik, kantong kresek>"],
  "radiusNote": "Radius 2 meter dari tong sampah diperiksa (sampah jalan raya diabaikan)",
  "alertSent": <true jika detectedTrashCount > 5, false jika tidak>,
  "alertMessage": "<pesan peringatan untuk petugas kebersihan jika status Kotor, atau null>"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Vision API error ${response.status}: ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Respon Gemini Vision kosong');
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// Fallback analyzer jika Gemini API belum diaktifkan/terkendala
function fallbackAnalyzeCctv(countOverride, imageName = '') {
  let count = 0;
  if (countOverride !== undefined && countOverride !== null) {
    count = Math.max(0, parseInt(countOverride, 10) || 0);
  } else {
    // Estimasi acak cerdas untuk demo jika tanpa override
    count = 0;
  }

  let status = 'Bersih';
  let statusColor = 'green';
  let summary = 'Lingkungan sekitar tong sampah dalam radius 2 meter bersih dan rapi. Tidak terdeteksi sampah berserakan.';
  let trashItems = [];
  let alertSent = false;
  let alertMessage = null;

  if (count > 5) {
    status = 'Kotor';
    statusColor = 'red';
    summary = `Peringatan: Terdeteksi sekitar ${count} sampah berserakan di sekitar tong sampah (radius <= 2 meter). Peringatan darurat telah diteruskan ke Petugas Kebersihan.`;
    trashItems = ['Kantong kresek berserakan', 'Botol & gelas kemasan plastik', 'Kertas/kardus tumpah'];
    alertSent = true;
    alertMessage = `🚨 PERINGATAN PETUGAS KEBERSIHAN: Area sekitar tong sampah EcoSort kotor dengan perkiraan ${count} sampah berserakan di luar tong (radius 2m). Mohon segera dibersihkan!`;
  } else if (count >= 1) {
    status = 'Waspada';
    statusColor = 'yellow';
    summary = `Terdeteksi sekitar ${count} sampah berserakan di dekat tong sampah (radius <= 2 meter). Sampah jauh di jalan raya/aspal tidak dihitung.`;
    trashItems = ['Kemasan plastik kecil', 'Gelas plastik bekas'];
    alertSent = false;
    alertMessage = null;
  }

  return {
    detectedTrashCount: count,
    status,
    statusColor,
    summary,
    trashItems,
    radiusNote: 'Radius 2 meter dari tong sampah diperiksa (sampah jalan raya diabaikan)',
    alertSent,
    alertMessage
  };
}

// =================================================================
//  POST /api/ai/analyze-cctv — Analisis gambar dari aplikasi CCTV / Web
// =================================================================
router.post('/analyze-cctv', requireAuthOrDeviceToken, async (req, res) => {
  try {
    const { image, deviceId = 'esp32-ecosort-1', count, prompt } = req.body || {};

    let analysisResult = null;
    let base64Pure = '';
    let mimeType = 'image/jpeg';

    // 1. Ekstrak data gambar jika dikirimkan
    if (image && typeof image === 'string') {
      const match = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        mimeType = 'image/' + match[1];
        base64Pure = match[2];
      } else {
        base64Pure = image;
      }

      // Simpan gambar CCTV terbaru ke server/data/latest_cctv.jpg
      try {
        const buffer = Buffer.from(base64Pure, 'base64');
        fs.writeFileSync(LATEST_CCTV_IMG, buffer);
      } catch (errImg) {
        console.warn('[AI/CCTV] Gagal menyimpan file gambar lokal:', errImg.message);
      }
    }

    // 2. Jika ada override count manual (misal testing langsung)
    if (count !== undefined && count !== null) {
      analysisResult = fallbackAnalyzeCctv(count);
    } else {
      // 3. Coba panggil Gemini Vision jika ada API Key dan ada gambar
      const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
      if (apiKey && base64Pure) {
        try {
          analysisResult = await callGeminiVision(apiKey, base64Pure, mimeType);
        } catch (errGemini) {
          console.warn('[AI/CCTV] Gemini Vision gagal, beralih ke Fallback Analyzer:', errGemini.message);
          analysisResult = fallbackAnalyzeCctv(count !== undefined ? count : 0);
          analysisResult.aiEngine = 'Fallback Engine (Google Cloud Project memerlukan aktivasi Generative Language API)';
        }
      } else {
        analysisResult = fallbackAnalyzeCctv(count !== undefined ? count : 0);
      }
    }

    // Pastikan nilai count terdefinisi
    const detectedCount = Math.max(0, parseInt(analysisResult.detectedTrashCount, 10) || 0);
    analysisResult.detectedTrashCount = detectedCount;

    // 4. Update data status perangkat di server secara instan
    const devices = readJSON(DEVICES_FILE, {});
    const dev = devices[deviceId] || {
      deviceId,
      lastSeen: new Date().toISOString(),
      weightGram: 0,
      totalWeightGram: 0,
      currentWeightGram: 0,
      distanceCm: 30,
      fullThresholdCm: 10,
      emptyDistanceCm: 35
    };

    dev.surroundingTrashCount = detectedCount;
    dev.surroundingTrashStatus = analysisResult.status;
    dev.surroundingTrashSummary = analysisResult.summary;
    dev.lastCctvAnalysisAt = new Date().toISOString();
    devices[deviceId] = dev;
    writeJSON(DEVICES_FILE, devices);

    // 5. Jika terdeteksi >5 sampah (Kotor), kirim peringatan ke Petugas Kebersihan
    if (detectedCount > 5 || analysisResult.alertSent) {
      const txs = readJSON(TRANSACTIONS_FILE, []);
      const nowObj = new Date();
      const nowStr = nowObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
                     nowObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      let maxId = 0;
      if (Array.isArray(txs) && txs.length > 0) {
        for (const t of txs) {
          if (t && t.id !== undefined && t.id !== null) {
            const num = parseInt(String(t.id).replace(/\D/g, ''), 10);
            if (!isNaN(num) && num < 10000 && num > maxId) maxId = num;
          }
        }
      }

      const nextId = String(maxId + 1);
      const reportCode = `LP-${nextId.padStart(4, '0')}`;
      txs.unshift({
        id: nextId,
        commandId: reportCode,
        reportCode: reportCode,
        date: nowStr,
        timestamp: new Date().toISOString(),
        type: 'Peringatan CCTV',
        amount: `${detectedCount} Sampah (Kotor)`,
        rawAmount: `Kamera AI: ${detectedCount} Sampah`,
        distance: '--',
        status: 'Petugas Diberitahu'
      });
      if (txs.length > 100) txs.pop();
      writeJSON(TRANSACTIONS_FILE, txs);
    }

    // 6. Simpan hasil analisis CCTV terakhir
    const latestData = {
      timestamp: new Date().toISOString(),
      deviceId,
      result: analysisResult,
      hasImage: Boolean(base64Pure)
    };
    writeJSON(LATEST_CCTV_FILE, latestData);

    return res.json({
      success: true,
      deviceId,
      ...analysisResult,
      analyzedAt: latestData.timestamp
    });

  } catch (err) {
    console.error('[AI/analyze-cctv] Error:', err.message);
    res.status(500).json({ error: 'Gagal menganalisis gambar CCTV: ' + err.message });
  }
});

// Alias endpoint
router.post('/analyze-image', requireAuthOrDeviceToken, (req, res) => {
  return router.handle({ ...req, url: '/analyze-cctv', originalUrl: '/api/ai/analyze-cctv' }, res);
});

// =================================================================
//  GET /api/ai/latest-cctv — Ambil data hasil analisa CCTV terakhir
// =================================================================
router.get('/latest-cctv', requireAuth, (req, res) => {
  try {
    const latest = readJSON(LATEST_CCTV_FILE, null);
    const hasImage = fs.existsSync(LATEST_CCTV_IMG);
    res.json({
      latest: latest || {
        timestamp: new Date().toISOString(),
        deviceId: 'esp32-ecosort-1',
        result: fallbackAnalyzeCctv(0),
        hasImage: false
      },
      hasImage
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data CCTV terakhir' });
  }
});

// =================================================================
//  GET /api/ai/latest-cctv-image — Unduh/tampilkan foto CCTV terakhir
// =================================================================
router.get('/latest-cctv-image', requireAuth, (req, res) => {
  if (fs.existsSync(LATEST_CCTV_IMG)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(LATEST_CCTV_IMG);
  } else {
    res.status(404).send('Belum ada snapshot CCTV yang tersimpan');
  }
});

module.exports = router;

