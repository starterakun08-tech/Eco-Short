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
    lastSeen: new Date().toISOString(),
    surroundingTrashCount: 0,
    surroundingTrashStatus: 'Bersih',
    surroundingTrashSummary: 'Lingkungan bersih'
  };

  const now = Date.now();
  const lastSeenMs = new Date(dev.lastSeen || 0).getTime();
  const isOnline = (now - lastSeenMs) < 15000;

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
    surroundingTrashCount: dev.surroundingTrashCount || 0,
    surroundingTrashStatus: dev.surroundingTrashStatus || 'Bersih',
    surroundingTrashSummary: dev.surroundingTrashSummary || 'Lingkungan sekitar bersih',
    recentEvents: txs
  };
}

// Helper untuk memilih variasi jawaban secara acak agar percakapan terasa hidup dan natural
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Engine Percakapan Natural EcoSort — Luwes, santai, nyambung, tanpa template formulir kaku
function generateNaturalConversation(userMessage, ctx, history = []) {
  const raw = (userMessage || '').trim();
  const q = raw.toLowerCase();

  const curWeight = Number(ctx.currentWeightGram).toFixed(1);
  const totalWeight = ctx.totalWeightGram >= 1000 
    ? `${(ctx.totalWeightGram / 1000).toFixed(2)} kg` 
    : `${Number(ctx.totalWeightGram).toFixed(1)} g`;
  const distText = ctx.distanceCm !== null ? `${Number(ctx.distanceCm).toFixed(1)} cm` : 'belum terbaca';

  // 1. Kritik / Complain kalau bot terasa kaku atau gak nyambung
  if (q.includes('gak nyambung') || q.includes('nggak nyambung') || q.includes('ga nyambung') || 
      q.includes('templet') || q.includes('template') || q.includes('kaku') || q.includes('jawab yang bener') ||
      q.includes('oi') && (q.includes('bisa') || q.includes('ngobrol'))) {
    return pickOne([
      `Siap, maaf banget kalau tadi terkesan kaku atau kurang nyambung! Sekarang aku dengerin bener-bener kok. Mau ngobrolin apa nih? Mau bahas kondisi tong sampah kita, teknologi sensornya, atau mau ngobrol santai hal lain?`,
      `Waduh, ampun bos! Haha, siap, ini aku udah mode santai dan luwes. Janji gak bakal kayak robot kaku lagi. Ada hal seru atau pertanyaan apa yang mau kamu tanyain?`,
      `Iya nih, tadi otak digital-ku sempat kepentok mode formulir haha. Santai, yuk kita ngobrol asik sekarang. Mau nanya apa tentang EcoSort atau mau curhat soal apa?`
    ]);
  }

  // 2. Sapaan & Salam Santai (Halo, Hai, Oi, P, Bro, dll)
  if (/^(hi|hai|halo|hello|hey|hei|oi|oy|p|pp|tes|test|pagi|siang|sore|malam|assalamualaikum|ass|woi|bro|min)[\s!.?]*$/i.test(q) || 
      q === 'halo' || q === 'hai' || q === 'oi' || q === 'p') {
    const greetings = [
      `Halo! 👋 Senang banget bisa ngobrol sama kamu. Gimana kabarmu hari ini? Ada yang mau dicek di tong sampah kita atau mau ngobrol santai aja?`,
      `Hai! Lagi santai nih? Aku siap bantu pantau kondisi EcoSort atau sekadar nemenin kamu ngobrol. Ada kabar seru apa hari ini?`,
      `Oi! Salam kenal ya. Santai aja di sini, kamu bisa tanya apa aja soal sensor, kapasitas tong sampah, atau ngobrol bebas. Mau mulai dari mana nih?`,
      `Halo juga! Semoga harimu lancar dan menyenangkan ya. Ada yang bisa aku bantu seputar EcoSort atau ada topik menarik yang mau kita bahas?`
    ];
    if (q.includes('assalamualaikum')) {
      return `Wa'alaikumsalam warahmatullahi wabarakatuh! 🙏 Halo, senang bisa menyapa kamu. Ada yang bisa kubantu hari ini seputar tong sampah EcoSort kita?`;
    }
    return pickOne(greetings);
  }

  // 3. Tanya Kabar & Small Talk (Apa kabar, lagi apa, sibuk apa)
  if (q.includes('apa kabar') || q.includes('gimana kabar') || q.includes('kabar') || q.includes('sehat')) {
    return pickOne([
      `Kabar aku baik banget dan selalu siap siaga! Lagi asik mantau data sensor EcoSort nih. Kamu sendiri gimana kabarnya hari ini? Semoga sehat dan harimu menyenangkan ya!`,
      `Alhamdulillah sehat bugar! Sensor-sensor di tempat sampah juga lagi aktif memantau. Kamu gimana, pekerjaan atau kuliah hari ini lancar?`
    ]);
  }

  if (q.includes('lagi apa') || q.includes('lagi ngapain') || q.includes('sibuk apa')) {
    return pickOne([
      `Lagi standby nih, mengamati data timbangan sama sensor jarak tong sampah biar nggak ada sampah yang meluber. Sekaligus nungguin kamu ajak ngobrol haha. Kamu sendiri lagi sibuk ngerjain apa nih?`,
      `Lagi santai sambil jagain kebersihan area sekitar tong sampah lewat kamera CCTV. Sampah saat ini tercatat sekitar ${curWeight} gram. Kamu lagi ngapain nih, lagi istirahat atau nugas?`
    ]);
  }

  // 4. Identitas & Perkenalan (Siapa kamu, nama kamu, kamu ai apa)
  if (q.includes('siapa kamu') || q.includes('kamu siapa') || q.includes('nama kamu') || q.includes('namamu') || 
      q.includes('kamu robot') || q.includes('kamu ai') || q.includes('tentang kamu') || q.includes('bisa apa')) {
    return `Aku adalah **EcoSort AI**, asisten cerdas sekaligus teman ngobrol kamu untuk sistem tong sampah pintar ini! 🌟\n\nTugasku macam-macam nih:\n- Ngawasi kapasitas dan berat sampah biar nggak sampai luber.\n- Memantau kamera CCTV sekitar tong sampah untuk mendeteksi sampah berserakan.\n- Mengatur kalibrasi dan perintah mikrokontroler ESP32.\n- Dan yang paling seru, nemenin kamu ngobrol nyambung soal apa pun—mulai dari teknologi, tips lingkungan, sampai obrolan santai sehari-hari. Panggil aja aku EcoSort atau Asisten ya!`;
  }

  // 5. Candaan / Humor / Tebak-tebakan (Lelucon, jokes, tebak-tebakan)
  if (q.includes('canda') || q.includes('lelucon') || q.includes('lawak') || q.includes('lucu') || 
      q.includes('tebak') || q.includes('joke') || q.includes('ketawa')) {
    return pickOne([
      `Haha, boleh! Nih tebak-tebakan santai:\n\n*Tempat sampah apa yang paling sopan dan banyak disukai orang?*\n...\n*Jawabannya:* Tempat sampah yang selalu nampung unek-unek tanpa pernah ngegosipin balik! 😂 Mau tebak-tebakan yang lain?`,
      `Nih aku ada lelucon ringan:\n\nKenapa tempat sampah pintar EcoSort suka belajar fisika?\nKarena tiap hari dia selalu **menimbang-nimbang** keputusan hidup dengan sangat teliti! ⚖️ Haha, garing gak?`,
      `Tebak dong: *Kenapa botol plastik bekas kalau dibuang ke tempat sampah suka senyum?*\n...\n*Karena dia tahu sebentar lagi bakal di-daur ulang jadi barang baru yang lebih keren!* ♻️ Gimana, mau tebakan lagi?`
    ]);
  }

  // 6. Ucapan Terima Kasih & Pujian
  if (q.includes('makasih') || q.includes('terima kasih') || q.includes('thanks') || q.includes('thx') || 
      q.includes('keren') || q.includes('hebat') || q.includes('mantap') || q.includes('pintar') || q.includes('good')) {
    return pickOne([
      `Sama-sama! Senang banget bisa bantu dan ngobrol sama kamu. Kalau butuh info apa-apa lagi atau mau ngobrol, kabari aja ya! 😊`,
      `Hehe makasih banyak ya apresiasinya! Ini juga berkat kerja sama kita yang rajin memantau kebersihan lingkungan. Tetap semangat! 💪`
    ]);
  }

  // 7. Pertanyaan Kapasitas / Status Penuh Tong Sampah
  if (q.includes('penuh') || q.includes('kapasitas') || q.includes('isi') || q.includes('volume') || q.includes('level')) {
    if (ctx.fillPercent >= 80 || ctx.statusText === 'PENUH') {
      return `🚨 Waduh, tong sampah kita sekarang udah **hampir penuh (${ctx.fillPercent}%)** nih!\n\nJarak sensor ke tumpukan sampah tinggal **${distText}** (batas penuh kita atur di ${ctx.fullThresholdCm} cm). Sebaiknya segera dikosongkan ya biar sampahnya nggak tumpah ke lantai.`;
    }
    return `✅ Tenang aja, kapasitas tong sampah saat ini **masih aman banget (${ctx.fillPercent}%)**.\n\nJarak dari sensor ke dasar/sampah masih sekitar **${distText}**, jadi masih ada banyak ruang kosong buat nampung sampah baru. Nanti kalau udah di atas 80%, aku bakal langsung kasih peringatan ke kamu!`;
  }

  // 8. Pertanyaan Berat & Timbangan (Load Cell HX711)
  if (q.includes('berat') || q.includes('timbangan') || q.includes('gram') || q.includes('kg') || q.includes('load cell') || q.includes('tare')) {
    return `⚖️ Untuk urusan timbangan:\n\nBeban sampah yang saat ini ada di dalam tong tercatat **${curWeight} gram**.\nSedangkan total akumulasi sampah yang pernah dibuang ke sini sudah mencapai **${totalWeight}**.\n\nOh iya, timbangan kita pakai sensor load cell HX711 dengan faktor kalibrasi yang terkunci stabil, jadi angkanya nggak bakal loncat-loncat. Kalau kamu ngerasa timbangannya geser saat kosong, kamu bisa klik tombol **Reset Timbangan** di panel kanan ya.`;
  }

  // 9. Pertanyaan tentang Servo / Tutup Otomatis / Sensor Tangan
  if (q.includes('servo') || q.includes('tutup') || q.includes('buka') || q.includes('tangan') || q.includes('gerak') || q.includes('macet')) {
    return `🤖 **Mekanisme Tutup Otomatis EcoSort:**\n\nTutup tong digerakkan oleh motor servo MG995 bertenaga tinggi yang terhubung ke pin ESP32.\n- Di bagian depan tong ada sensor ultrasonik deteksi tangan (radius aktif <= 35 cm).\n- Begitu tangan kamu mendekat, servo langsung berputar membuka tutup 180° secara otomatis.\n- Setelah jeda sekitar 4.5 detik untuk buang sampah, tutup bakal menutup sendiri dengan mulus.\nJadi kamu nggak perlu menyentuh tong sama sekali, lebih higienis dan bebas kuman!`;
  }

  // 10. Pertanyaan CCTV / Kamera AI / Pantauan Lingkungan
  if (q.includes('cctv') || q.includes('kamera') || q.includes('radius') || q.includes('lingkungan') || q.includes('bersih') || q.includes('kotor')) {
    const cctvStatus = ctx.surroundingTrashStatus || 'Bersih';
    const cctvCount = ctx.surroundingTrashCount || 0;
    return `📹 **Pantauan Kamera CCTV Cerdas:**\n\nKamera kita memantau area sekeliling tong sampah khusus dalam **radius maksimal 2 meter** (sampah jauh di jalan raya otomatis diabaikan).\n\nKondisi saat ini:\n- **Status Kebersihan:** ${cctvStatus === 'Bersih' ? '🟢 Bersih' : cctvStatus === 'Waspada' ? '🟡 Waspada' : '🔴 Kotor'}\n- **Jumlah Sampah Berserakan:** ${cctvCount} objek\n\nJika ada lebih dari 5 sampah berserakan di luar tong, sistem langsung mengirimkan sinyal peringatan darurat ke Petugas Kebersihan untuk segera disapu. Kamu juga bisa menghubungkan HP Android kamu lewat aplikasi CCTV EcoSort untuk streaming gambar secara langsung lho!`;
  }

  // 11. Pertanyaan Seputar ESP32 & Koneksi Alat
  if (q.includes('esp32') || q.includes('alat') || q.includes('perangkat') || q.includes('online') || q.includes('offline') || q.includes('koneksi')) {
    const statusConn = ctx.isOnline ? '🟢 Online (Terhubung Lancar)' : '⚪ Offline / Standby';
    return `📡 **Kondisi Perangkat ESP32 (${ctx.deviceId}):**\n\n- Status Koneksi: **${statusConn}**\n- Terakhir Terlihat: ${ctx.lastSeen ? new Date(ctx.lastSeen).toLocaleTimeString('id-ID') : 'Belum tercatat'}\n- Sensor Jarak: ${distText}\n- Beban Sensor: ${curWeight} g (Kapasitas: ${ctx.fillPercent}%)\n\nSistem firmware ESP32 kita sudah dilengkapi fitur non-blocking lho, jadi kalau misalnya WiFi sempat putus sekalipun, buka-tutup servo dan sensor tangan tetap jalan normal tanpa nge-freeze!`;
  }

  // 12. Tips Lingkungan / Pemilahan & Daur Ulang Sampah
  if (q.includes('organik') || q.includes('anorganik') || q.includes('daur ulang') || q.includes('tips') || q.includes('sampah') && (q.includes('cara') || q.includes('macam') || q.includes('pilah'))) {
    return `♻️ **Tips Pintar Memilah Sampah dari EcoSort:**\n\n1. **Sampah Organik (Sisa Makanan, Daun, Buah):**\n   Bisa diolah jadi kompos atau pakan maggot. Jangan dicampur dengan plastik biar nggak bau dan cepat terurai.\n2. **Sampah Anorganik (Botol Plastik, Kaleng, Kertas):**\n   Pastikan dibilas bersih dari sisa cairan sebelum dibuang agar nilainya tinggi saat disetor ke Bank Sampah atau didaur ulang.\n3. **Sampah B3 (Baterai, Lampu, Obat Kadaluwarsa):**\n   Harus dipisah khusus karena mengandung zat beracun yang berbahaya bagi tanah.\n\nAda jenis sampah tertentu yang mau kamu tanyakan cara daur ulangnya?`;
  }

  // 13. Respon Bebas & Konseptual yang Tetap "Nyambung"
  const conversationalReplies = [
    `Menarik nih obrolanmu soal "${raw}"! Menurutku ini hal yang bagus buat dibahas. Kalau dikaitkan dengan sistem EcoSort kita, saat ini kapasitas tong masih di angka **${ctx.fillPercent}%** dan beratnya **${curWeight} g**. Menurut kamu sendiri gimana?`,
    `Wah pertanyaan yang asik tentang "${raw}"! Aku paham maksudmu. Di sistem EcoSort kita selalu berusaha bikin pemantauan sampah jadi cerdas dan praktis. Ada bagian tertentu yang bikin kamu penasaran atau mau kita diskusikan lebih jauh?`,
    `Haha, nyambung kok! Soal "${raw}", itu topik yang seru. Kondisi tong sampah EcoSort kita juga lagi aman terkendali saat ini (${ctx.fillPercent}% terisi). Ada hal lain yang mau kamu tanyakan ke aku?`
  ];
  return pickOne(conversationalReplies);
}

// ---- POST /api/ai/chat ----
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Pesan pertanyaan tidak boleh kosong' });
    }

    const ctx = getLiveContext();
    const apiKey = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();

    // Jika API Key belum ada atau formatnya jelas bukan API key Google (misal kosong atau token dummy)
    if (!apiKey || apiKey.length < 15) {
      const naturalReply = generateNaturalConversation(message, ctx, history);
      return res.json({
        configured: false,
        message: 'Mode percakapan lokal cerdas aktif.',
        reply: naturalReply,
        context: ctx
      });
    }

    // Panggil Google Gemini API dengan instruksi sistem alami & multi-turn history
    const systemInstructionText = `Anda adalah "EcoSort AI", asisten cerdas sekaligus sahabat ngobrol yang ramah, hangat, santai, dan luwes untuk pengguna sistem tempat sampah cerdas EcoSort IoT.

PANDUAN KOMUNIKASI PENTING:
1. Berbicaralah secara ALAMI, LUWES, dan AKRAB dalam Bahasa Indonesia (seperti teman bicara yang cerdas, asik, dan solutif).
2. HINDARI bahasa robot kaku, JANGAN gunakan template formulir yang berulang-ulang, dan JANGAN menjejalkan daftar poin data sensor jika pengguna hanya menyapa atau bertanya hal santai.
3. JAWAB NYAMBUNG sesuai maksud pengguna:
   - Jika pengguna menyapa ("halo", "oi", "apa kabar"), bercanda, curhat, atau mengajak ngobrol santai: balas dengan ramah, hangat, dan ajak berdialog secara asik.
   - Jika pengguna bertanya hal umum (sains, kehidupan, teknologi, lingkungan, cara daur ulang sampah): jelaskan secara menarik dan mudah dipahami.
   - Jika pengguna bertanya tentang tempat sampah, kapasitas, berat, sensor, atau status alat: jelaskan secara santai dan informatif berdasarkan data sensor terkini berikut.
4. DATA TELEMETRI SENSOR SAAT INI (gunakan secara cerdas jika relevan dengan pertanyaan):
   - ID Perangkat: ${ctx.deviceId}
   - Status Koneksi: ${ctx.isOnline ? 'Online (Terhubung)' : 'Offline (Standby)'}
   - Berat Sampah Saat Ini: ${Number(ctx.currentWeightGram).toFixed(1)} gram (Total Terkumpul: ${ctx.totalWeightGram} gram)
   - Kapasitas Terisi: ${ctx.fillPercent}% (Jarak Sensor: ${ctx.distanceCm} cm, Batas Penuh: ${ctx.fullThresholdCm} cm, Status: ${ctx.statusText})
   - Pantauan CCTV Lingkungan: Status ${ctx.surroundingTrashStatus}, ${ctx.surroundingTrashCount} sampah di sekitar tong.
5. Pertahankan percakapan agar mengalir lancar dan menyenangkan.`;

    // Bentuk riwayat obrolan untuk Gemini multi-turn
    const contents = [];
    if (Array.isArray(history) && history.length > 0) {
      // Ambil maksimal 8 percakapan terakhir agar konteks pas
      const recentHistory = history.slice(-8);
      for (const h of recentHistory) {
        if (!h || !h.text) continue;
        const role = (h.role === 'assistant' || h.role === 'ai' || h.role === 'model') ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: String(h.text) }]
        });
      }
    }

    // Tambahkan pesan pengguna saat ini
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      },
      contents,
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    };

    // Coba model gemini-1.5-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      console.warn('[AI/chat] Gemini API returned status:', response.status);
      const naturalReply = generateNaturalConversation(message, ctx, history);
      return res.json({
        configured: true,
        reply: naturalReply,
        context: ctx
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text && text.trim()) {
      return res.json({
        configured: true,
        reply: text.trim(),
        context: ctx
      });
    } else {
      const naturalReply = generateNaturalConversation(message, ctx, history);
      return res.json({
        configured: true,
        reply: naturalReply,
        context: ctx
      });
    }
  } catch (err) {
    console.error('[AI/chat] Error:', err.message);
    const ctx = getLiveContext();
    const naturalReply = generateNaturalConversation(req.body?.message || '', ctx, req.body?.history || []);
    res.json({
      configured: false,
      reply: naturalReply,
      context: ctx
    });
  }
});

// ---- GET /api/ai/status (Ping status & ketersediaan AI) ----
router.get('/status', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  res.json({
    online: true,
    service: 'EcoSort AI CCTV Service',
    configured: Boolean(apiKey && apiKey.length > 5),
    model: 'gemini-1.5-flash',
    time: new Date().toISOString()
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
router.get('/latest-cctv', requireAuthOrDeviceToken, (req, res) => {
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
router.get('/latest-cctv-image', (req, res) => {
  if (fs.existsSync(LATEST_CCTV_IMG)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(LATEST_CCTV_IMG);
  } else {
    res.status(404).send('Belum ada snapshot CCTV yang tersimpan');
  }
});

// =================================================================
//  GET /api/ai/server-info — Info IP & Port Server untuk Aplikasi CCTV
// =================================================================
router.get('/server-info', (req, res) => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name in ifaces) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  const port = process.env.PORT || 40122;
  const primaryIp = ips.find(ip => ip.startsWith('192.168.')) || '192.168.109.46';
  res.json({
    port,
    lanIp: primaryIp,
    serverUrl: `http://${primaryIp}:${port}`,
    allIps: ips
  });
});

// =================================================================
//  POST /api/ai/config-key — Simpan Google Gemini API Key dari Web
// =================================================================
router.post('/config-key', requireAuth, (req, res) => {
  try {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return res.status(400).json({ error: 'API Key tidak valid (minimal 10 karakter)' });
    }
    const cleanKey = apiKey.trim();
    process.env.GEMINI_API_KEY = cleanKey;

    const envPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (content.includes('GEMINI_API_KEY=')) {
        content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${cleanKey}`);
      } else {
        content += `\nGEMINI_API_KEY=${cleanKey}\n`;
      }
      fs.writeFileSync(envPath, content, 'utf8');
    }

    res.json({ success: true, message: 'Google Gemini API Key berhasil disimpan dan aktif!' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan API Key: ' + err.message });
  }
});

module.exports = router;

