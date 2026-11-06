// ============================================================
//  EcoSort IoT Dashboard — Main Application
//  Tema: Abu-abu Keputihan + Hijau #546B41 / #99AD7A
//  Bebas dari karakter emoji
// ============================================================

const DEVICE_ID = 'esp32-ecosort-1';
const POLL_DEVICES_MS = 2000;   // 2 detik
const POLL_HISTORY_MS = 10000;  // 10 detik
const POLL_LOG_MS = 5000;       // 5 detik

// ---- Auth helpers ----
function getToken() {
  return localStorage.getItem('ecosort_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken()
  };
}

function checkAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('ecosort_token');
  localStorage.removeItem('ecosort_user');
  window.location.href = '/login.html';
}

// ---- Toast notifications (Clean - Tanpa Emoji) ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---- Format helpers ----
function formatWeight(g) {
  if (g == null || g <= 0) return { val: '0', unit: 'g' };
  if (g < 1000) return { val: g.toFixed(1), unit: 'g' };
  return { val: (g / 1000).toFixed(2), unit: 'kg' };
}

function timeAgo(isoStr) {
  if (!isoStr) return 'Tidak diketahui';
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 0) return 'Baru saja';
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'Baru saja';
  if (secs < 60) return secs + ' detik lalu';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + ' menit lalu';
  const hrs = Math.floor(mins / 60);
  return hrs + ' jam lalu';
}

// ---- API fetchers ----
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      logout();
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return null;
  }
}

// ---- Update device status & live values ----
async function pollDevices() {
  const data = await apiFetch('/api/iot/devices', { headers: authHeaders() });
  if (!data || !data.devices) return;

  const dev = data.devices.find(d => d.deviceId === DEVICE_ID);
  if (!dev) {
    const badge = document.getElementById('statusBadge');
    badge.className = 'status-badge offline';
    document.getElementById('statusText').textContent = 'TIDAK ADA DATA';
    return;
  }

  // Status badge (Online / Offline)
  const badge = document.getElementById('statusBadge');
  if (badge) {
    badge.className = 'status-badge ' + (dev.online ? 'online' : 'offline');
    document.getElementById('statusText').textContent = dev.online ? 'ONLINE' : 'OFFLINE';
    document.getElementById('lastSeen').textContent = 'Pembaruan: ' + timeAgo(dev.lastSeen);
  }

  // Update status di sidebar
  const sidebarStatus = document.getElementById('sidebarStatusText');
  if (sidebarStatus) {
    sidebarStatus.textContent = dev.online ? 'ONLINE' : 'OFFLINE';
    sidebarStatus.style.color = dev.online ? '#99AD7A' : '#fca5a5';
  }

  // Update estimasi waktu di menu AI
  const aiTime = document.getElementById('aiTimeToFull');
  if (aiTime && dev.distanceCm != null) {
    const threshold = dev.fullThresholdCm || 10;
    const remaining = dev.distanceCm - threshold;
    if (remaining <= 0) {
      aiTime.textContent = 'Penuh!';
      aiTime.style.color = '#ef4444';
    } else {
      const hours = Math.max(1, Math.round(remaining / 3.2));
      aiTime.textContent = `~${hours}j 15m`;
      aiTime.style.color = 'var(--color-high)';
    }
  }

  // Live Weight
  const wt = formatWeight(dev.currentWeightGram);
  document.getElementById('valWeight').textContent = wt.val;
  document.querySelector('#cardWeight .unit').textContent = wt.unit;

  // Total Accumulated Weight
  const tw = formatWeight(dev.totalWeightGram);
  document.getElementById('valTotalWeight').textContent = tw.val;
  document.getElementById('unitTotal').textContent = tw.unit;

  // Distance
  const dist = dev.distanceCm;
  document.getElementById('valDistance').textContent = dist != null ? dist.toFixed(1) : '--';

  // Fill Level (Persentase Ketinggian)
  const empty = dev.emptyDistanceCm || 35;
  const threshold = dev.fullThresholdCm || 10;
  let fillPct = 0;
  if (dist != null && empty > 0) {
    fillPct = Math.max(0, Math.min(100, ((empty - dist) / (empty - threshold)) * 100));
  }
  document.getElementById('valFill').textContent = Math.round(fillPct);
  
  // Warna bar fill sesuai aturan:
  // Tertinggi: #546B41 (class .high)
  // Rendah / Terendah: #99AD7A (class bawaan .fill-bar)
  const fillBar = document.getElementById('fillBar');
  fillBar.style.width = fillPct + '%';
  if (fillPct >= 90) {
    fillBar.className = 'fill-bar danger';
  } else if (fillPct >= 50) {
    fillBar.className = 'fill-bar high';
  } else {
    fillBar.className = 'fill-bar';
  }

  // Status Text (Tanpa Emoticon)
  const statusCard = document.getElementById('cardStatus');
  const statusVal = document.getElementById('valStatus');
  if (dist != null && dist <= threshold) {
    statusVal.textContent = 'PENUH';
    statusVal.style.color = '#ef4444';
    statusCard.className = 'sensor-card status-penuh';
  } else if (dist == null) {
    statusVal.textContent = 'SENSOR ERROR';
    statusVal.style.color = '#f59e0b';
    statusCard.className = 'sensor-card status-error';
  } else {
    statusVal.textContent = 'AMAN';
    statusVal.style.color = '#546B41';
    statusCard.className = 'sensor-card status-aman';
  }
}

// ---- Update Chart ----
async function pollHistory() {
  const data = await apiFetch('/api/iot/history?deviceId=' + DEVICE_ID + '&limit=60', {
    headers: authHeaders()
  });
  if (data && data.history) {
    updateChart(data.history);
  }
}

// ---- Update Command Log ----
async function pollCommandLog() {
  const data = await apiFetch('/api/iot/command-log', { headers: authHeaders() });
  if (!data || !data.log) return;

  const list = document.getElementById('logList');
  if (data.log.length === 0) {
    list.innerHTML = '<li class="log-item" style="justify-content:center; color:var(--text-secondary);">Belum ada perintah dikirim</li>';
    return;
  }

  list.innerHTML = data.log.map(entry => {
    const typeLabels = {
      tare: 'TARE',
      set_calibration: 'KALIBRASI',
      set_interval: 'INTERVAL',
      restart: 'RESTART'
    };
    const paramStr = entry.params && Object.keys(entry.params).length > 0
      ? JSON.stringify(entry.params)
      : '-';
    return `
      <li class="log-item">
        <span class="log-type">${typeLabels[entry.type] || entry.type}</span>
        <span class="log-params">${paramStr}</span>
        <span class="log-status ${entry.status}">${entry.status === 'delivered' ? 'Diterima ESP' : 'Antrean'}</span>
        <span class="log-time">${timeAgo(entry.createdAt)}</span>
      </li>
    `;
  }).join('');
}

// ---- Send commands core ----
async function sendCommand(type, params = {}) {
  const data = await apiFetch('/api/iot/command', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ deviceId: DEVICE_ID, type, params })
  });

  if (data && data.status === 'queued') {
    pollCommandLog();
    return true;
  } else {
    return false;
  }
}

// ============================================================
//  Perbaikan Bug Kontrol Perangkat
// ============================================================

// 1. Tare Handler
async function handleTare() {
  const btn = document.getElementById('btnTare');
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  const ok = await sendCommand('tare');
  if (ok) {
    showToast('Perintah TARE berhasil dikirim ke antrean perangkat', 'success');
  } else {
    showToast('Gagal mengirim perintah TARE', 'error');
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = originalText;
  }, 1000);
}

// 2. Calibration Handler
async function handleCalibration() {
  const input = document.getElementById('inputCal');
  const btn = document.getElementById('btnCal');
  const val = parseFloat(input.value);

  if (isNaN(val) || val <= 0) {
    showToast('Masukkan nilai kalibrasi yang valid (> 0)', 'error');
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Kirim...';

  const ok = await sendCommand('set_calibration', { value: val });
  if (ok) {
    document.getElementById('currentCal').textContent = val.toFixed(1);
    localStorage.setItem('ecosort_cal', val);
    input.value = '';
    showToast('Faktor kalibrasi diperbarui ke ' + val.toFixed(1), 'success');
  } else {
    showToast('Gagal mengubah faktor kalibrasi', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Terapkan';
}

// 3. Interval Handler
async function handleInterval() {
  const input = document.getElementById('inputInterval');
  const btn = document.getElementById('btnInterval');
  const val = parseInt(input.value, 10);

  if (isNaN(val) || val < 1 || val > 60) {
    showToast('Interval pengiriman harus antara 1 sampai 60 detik', 'error');
    input.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Kirim...';

  const ok = await sendCommand('set_interval', { value: val });
  if (ok) {
    document.getElementById('currentInterval').textContent = val + ' detik';
    localStorage.setItem('ecosort_interval', val);
    input.value = '';
    showToast('Interval pengiriman diubah ke ' + val + ' detik', 'success');
  } else {
    showToast('Gagal mengubah interval pengiriman', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Terapkan';
}

// 4. Restart Handler
async function handleRestart() {
  if (!confirm('Konfirmasi: Restart ESP32 sekarang?\nPerangkat akan terputus sejenak saat booting.')) {
    return;
  }

  const btn = document.getElementById('btnRestart');
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Memproses Restart...';

  const ok = await sendCommand('restart');
  if (ok) {
    showToast('Perintah restart berhasil dikirim ke ESP32', 'success');
  } else {
    showToast('Gagal mengirim perintah restart', 'error');
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = originalText;
  }, 3000);
}

// ============================================================
//  Modul Pemantau Kamera CCTV (NEXA Multi-Camera)
// ============================================================

let isCameraStreaming = false;
const DEFAULT_CAM_URL = '/api/camera/stream';

function getCameraUrl() {
  return localStorage.getItem('ecosort_cam_url') || DEFAULT_CAM_URL;
}

function initCamera() {
  // Update jam digital HUD kamera
  updateCameraClock();
  setInterval(updateCameraClock, 1000);

  // Set nilai input URL kamera yang tersimpan
  const input = document.getElementById('camUrlInput');
  if (input) {
    input.value = getCameraUrl();
  }

  // Jika sebelumnya user sedang streaming, auto hubungkan
  const autoStart = localStorage.getItem('ecosort_cam_autostart') === 'true';
  if (autoStart) {
    startCameraStream();
  }
}

function updateCameraClock() {
  const clockEl = document.getElementById('cameraHudTime');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function toggleCameraSettings() {
  const panel = document.getElementById('cameraSettingsPanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
}

function setCameraPreset(url) {
  const input = document.getElementById('camUrlInput');
  if (input) {
    input.value = url;
    saveCameraUrl();
  }
}

function saveCameraUrl() {
  const input = document.getElementById('camUrlInput');
  const url = (input ? input.value : '').trim();
  if (!url) {
    showToast('Masukkan URL aliran kamera yang valid', 'error');
    return;
  }
  localStorage.setItem('ecosort_cam_url', url);
  showToast('Sumber kamera diperbarui', 'success');
  
  // Sembunyikan panel setelah simpan
  const panel = document.getElementById('cameraSettingsPanel');
  if (panel) panel.style.display = 'none';

  // Mulai / restart aliran
  startCameraStream();
}

function startCameraStream() {
  const img = document.getElementById('cameraStreamImg');
  const standby = document.getElementById('cameraStandby');
  const label = document.getElementById('camConnectionLabel');
  const pill = document.getElementById('camStatusText');
  const dot = document.getElementById('camDot');

  const streamUrl = getCameraUrl();
  if (!streamUrl) return;

  isCameraStreaming = true;
  localStorage.setItem('ecosort_cam_autostart', 'true');

  if (label) label.textContent = 'Menghubungkan...';
  if (pill) pill.textContent = 'MEMUAT';
  if (dot) dot.className = 'cam-dot';

  // Tambahkan timestamp anti-cache
  const cleanUrl = streamUrl + (streamUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
  img.src = cleanUrl;
  img.style.display = 'block';
  standby.style.display = 'none';

  img.onload = () => {
    if (label) label.textContent = 'Terhubung Live';
    if (pill) pill.textContent = 'LIVE';
    if (dot) dot.className = 'cam-dot live';
  };

  img.onerror = () => {
    // Aliran tidak merespons (misal kamera offline)
    if (label) label.textContent = 'Aliran Standby / Uji';
    if (pill) pill.textContent = 'STANDBY';
    if (dot) dot.className = 'cam-dot';
  };
}

function refreshCameraStream() {
  if (!isCameraStreaming) {
    startCameraStream();
    return;
  }
  const img = document.getElementById('cameraStreamImg');
  const streamUrl = getCameraUrl();
  const cleanUrl = streamUrl + (streamUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
  img.src = cleanUrl;
  showToast('Aliran kamera dimuat ulang', 'info');
}

function toggleCameraFullscreen() {
  const wrap = document.getElementById('cameraViewportWrap');
  if (!wrap) return;

  if (!document.fullscreenElement) {
    if (wrap.requestFullscreen) {
      wrap.requestFullscreen();
    } else if (wrap.webkitRequestFullscreen) {
      wrap.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function takeCameraSnapshot() {
  const img = document.getElementById('cameraStreamImg');
  if (!img || img.style.display === 'none' || !img.src) {
    showToast('Aliran kamera belum terhubung untuk tangkapan layar', 'error');
    return;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1280;
    canvas.height = img.naturalHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'ecosort-camera-snapshot-' + Date.now() + '.png';
    a.click();
    showToast('Tangkapan layar tersimpan', 'success');
  } catch (e) {
    // Jika cross-origin, buka URL frame di tab baru
    window.open(img.src, '_blank');
    showToast('Membuka tangkapan gambar kamera di tab baru', 'info');
  }
}

// ============================================================
//  Sidebar & View Navigation (Home, AI, Notifikasi)
// ============================================================

function switchView(viewName) {
  const views = ['home', 'ai', 'notifications'];
  if (!views.includes(viewName)) viewName = 'home';

  // Toggle active views
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    const nav = document.getElementById('navItem-' + v);
    if (el) {
      if (v === viewName) {
        el.style.display = 'block';
        el.classList.add('page-view');
      } else {
        el.style.display = 'none';
      }
    }
    if (nav) {
      if (v === viewName) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    }
  });

  // Update page title
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    if (viewName === 'home') titleEl.textContent = 'EcoSort IoT Dashboard';
    if (viewName === 'ai') titleEl.textContent = 'Pusat Analisis & Pemilahan AI';
    if (viewName === 'notifications') titleEl.textContent = 'Pusat Notifikasi AI';
  }

  // Auto close mobile sidebar
  toggleSidebar(false);

  // Jika kembali ke home dan ada chart, resize/update chart
  if (viewName === 'home' && sensorChart) {
    setTimeout(() => {
      sensorChart.resize();
    }, 100);
  }

  // Jika membuka notifikasi, pastikan filter default 'today' aktif jika belum ada tab aktif
  if (viewName === 'notifications') {
    const activeTab = document.querySelector('.notif-tab.active');
    if (!activeTab) {
      filterNotifs('today');
    }
  }

  // Simpan state menu
  sessionStorage.setItem('ecosort_current_view', viewName);
}

function toggleSidebar(open) {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || !backdrop) return;

  const isOpen = typeof open === 'boolean' ? open : !sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.add('open');
    backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }
}

// ============================================================
//  Filter Notifikasi (Today, This Week, Earlier, See All)
// ============================================================

function filterNotifs(category) {
  // Update active tab buttons
  const tabs = ['today', 'week', 'earlier'];
  tabs.forEach(t => {
    const tabEl = document.getElementById('tab-' + t);
    if (tabEl) {
      if (t === category) {
        tabEl.classList.add('active');
      } else {
        tabEl.classList.remove('active');
      }
    }
  });

  // Filter notification items
  const items = document.querySelectorAll('.notif-item');
  items.forEach(item => {
    const itemCat = item.getAttribute('data-category');
    if (category === 'all' || itemCat === category) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function filterNotifCategory(cat) {
  if (cat === 'all') {
    // Tampilkan semua item
    const items = document.querySelectorAll('.notif-item');
    items.forEach(item => item.style.display = 'flex');

    // Reset tabs
    document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
    showToast('Menampilkan seluruh riwayat notifikasi', 'info');
  }
}

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

  // Render username bersih
  const user = localStorage.getItem('ecosort_user') || 'admin';
  const userEl = document.getElementById('headerUser');
  if (userEl) userEl.textContent = user;

  // Restore saved active calibration / interval if available
  const savedCal = localStorage.getItem('ecosort_cal');
  if (savedCal) {
    const el = document.getElementById('currentCal');
    if (el) el.textContent = parseFloat(savedCal).toFixed(1);
  }
  const savedInterval = localStorage.getItem('ecosort_interval');
  if (savedInterval) {
    const el = document.getElementById('currentInterval');
    if (el) el.textContent = savedInterval + ' detik';
  }

  // Restore saved view
  const savedView = sessionStorage.getItem('ecosort_current_view');
  if (savedView) {
    switchView(savedView);
  } else {
    filterNotifs('today');
  }

  // Initial fetch
  initCamera();
  pollDevices();
  pollHistory();
  pollCommandLog();

  // Polling loops
  setInterval(pollDevices, POLL_DEVICES_MS);
  setInterval(pollHistory, POLL_HISTORY_MS);
  setInterval(pollCommandLog, POLL_LOG_MS);
});
