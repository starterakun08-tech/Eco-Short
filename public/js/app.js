// ============================================================
//  Creativilo / EcoSort IoT Dashboard — App Logic
// ============================================================

const API_BASE = '/api/iot';
const TOKEN_KEY = 'ecosort_token';
const DEVICE_ID = 'esp32-ecosort-1';

// Polling intervals
const POLL_INTERVAL_MS = 2000;
const HISTORY_INTERVAL_MS = 5000;
const TX_INTERVAL_MS = 4000;

// State
let lastDeviceData = null;
let emptyDist = 35;
let fullThresh = 10;

// ---- Authentication Helper ----
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

function checkAuth() {
  const token = getToken();
  if (!token) {
    // Auto redirect ke login jika belum login
    window.location.href = '/login.html';
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login.html';
}

// ---- Toast Notifications ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ---- UI Navigation ----
function switchNav(name) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById('nav-' + name);
  if (activeBtn) activeBtn.classList.add('active');
}

// ---- Modal Kontrol & Pengaturan ----
function openControlModal() {
  const modal = document.getElementById('controlModal');
  if (modal) modal.classList.add('open');
}

function closeControlModal() {
  const modal = document.getElementById('controlModal');
  if (modal) modal.classList.remove('open');
}

// Tutup modal jika klik di luar card
window.addEventListener('click', (e) => {
  const modal = document.getElementById('controlModal');
  if (e.target === modal) closeControlModal();
});

// ---- Polling Status Perangkat ----
async function fetchDeviceStatus() {
  try {
    const res = await fetch(`${API_BASE}/devices`, { headers: authHeaders() });
    if (res.status === 401) {
      logout();
      return;
    }
    const data = await res.json();
    const dev = (data.devices || []).find(d => d.deviceId === DEVICE_ID) || data.devices?.[0];

    if (!dev) return;
    lastDeviceData = dev;

    emptyDist = dev.emptyDistanceCm || 35;
    fullThresh = dev.fullThresholdCm || 10;

    // 1. Kartu Total Visits -> Berat Sensor (currentWeightGram)
    const weightVal = dev.currentWeightGram ?? dev.weightGram ?? 0;
    const elWeight = document.getElementById('valWeight');
    if (elWeight) {
      elWeight.innerHTML = `${Number(weightVal).toFixed(1)}<span class="hero-unit">g</span>`;
    }

    // 2. Kartu Bounce Rate -> Jarak (distanceCm)
    const distVal = dev.distanceCm;
    const elDist = document.getElementById('valDistance');
    if (elDist) {
      if (distVal !== null && distVal !== undefined) {
        elDist.innerHTML = `${Number(distVal).toFixed(1)}<span class="hero-unit">cm</span>`;
      } else {
        elDist.innerHTML = `Err<span class="hero-unit">cm</span>`;
      }
    }

    // 3. Kartu Realtime Users -> Status (PENUH / AMAN / ERROR)
    const elStatus = document.getElementById('valStatus');
    let statusText = 'AMAN';
    if (distVal === null || distVal === undefined) {
      statusText = 'ERROR';
    } else if (distVal <= fullThresh) {
      statusText = 'PENUH';
    } else {
      statusText = 'AMAN';
    }
    if (elStatus) elStatus.textContent = statusText;

    // 4. Donut Customers -> Persentase Isi Tong
    let fillPercent = 37; // default mockup
    if (distVal !== null && distVal !== undefined) {
      const denom = (emptyDist - fullThresh) || 1;
      const num = emptyDist - distVal;
      fillPercent = Math.min(100, Math.max(0, Math.round((num / denom) * 100)));
    }
    if (typeof updateDonutChartData === 'function') {
      updateDonutChartData(fillPercent);
    }

    // 5. Panel Profile (Kanan Atas)
    // Device ID & Online Status (online jika < 10 detik)
    const now = Date.now();
    const lastSeenTime = new Date(dev.lastSeen).getTime();
    const isOnline = (now - lastSeenTime) < 10000;

    const elProfileName = document.getElementById('profileDeviceId');
    if (elProfileName) elProfileName.textContent = dev.deviceId || 'esp32-ecosort-1';

    const elDot = document.getElementById('statusOnlineDot');
    if (elDot) {
      if (isOnline) {
        elDot.className = 'status-online-dot';
      } else {
        elDot.className = 'status-online-dot offline';
      }
    }

    const elProfileStatus = document.getElementById('profileStatus');
    if (elProfileStatus) {
      elProfileStatus.textContent = isOnline ? 'Online • 5 from 8 tasks' : 'Offline • Terputus';
    }

    // 3 Angka Kecil Metrik Profile:
    // Metrik 1: Total Berat Terkumpul
    const totW = dev.totalWeightGram || 0;
    const elM1 = document.getElementById('profileMetric1');
    if (elM1) {
      if (totW >= 1000) {
        elM1.textContent = (totW / 1000).toFixed(1) + 'K';
      } else {
        elM1.textContent = totW.toFixed(0) + 'g';
      }
    }

    // Metrik 2: Jumlah Kejadian Penimbangan
    const elM2 = document.getElementById('profileMetric2');
    if (elM2) {
      elM2.textContent = '3.2M'; // format tampilan desain
    }

    // Metrik 3: Uptime / Terakhir Terlihat
    const elM3 = document.getElementById('profileMetric3');
    if (elM3) {
      const diffSec = Math.floor((now - lastSeenTime) / 1000);
      if (isOnline) {
        elM3.textContent = diffSec <= 2 ? 'Live' : diffSec + 's lalu';
      } else {
        elM3.textContent = 'Offline';
      }
    }

    // 6. Kartu Earning (Kanan Bawah) -> Total Berat Terkumpul
    const elEarning = document.getElementById('earningAmount');
    if (elEarning) {
      elEarning.textContent = `$${totW.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
    }

  } catch (err) {
    console.error('Error fetching devices:', err);
  }
}

// ---- Polling Riwayat Sensor ----
async function fetchHistory() {
  try {
    const res = await fetch(`${API_BASE}/history?deviceId=${DEVICE_ID}&limit=50`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.history && typeof updateRevenueChartData === 'function') {
      updateRevenueChartData(data.history);
    }
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

// ---- Polling Transaksi (Recent Transaction) ----
async function fetchTransactions() {
  try {
    const res = await fetch(`${API_BASE}/transactions`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.transactions || [];
    renderTransactions(list);
  } catch (err) {
    console.error('Error fetching transactions:', err);
  }
}

function renderTransactions(list) {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody || list.length === 0) return;

  const html = list.slice(0, 4).map(tx => {
    let badgeClass = 'badge-completed';
    const st = (tx.status || '').toLowerCase();
    if (st.includes('pending') || st.includes('menunggu')) badgeClass = 'badge-pending';
    else if (st.includes('scheduled') || st.includes('terkirim')) badgeClass = 'badge-scheduled';

    return `
      <tr>
        <td>
          <div class="tx-id-col">
            <div class="tx-icon-circle">
              <svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7z"/></svg>
            </div>
            <span>${escapeHTML(tx.id)}</span>
          </div>
        </td>
        <td class="tx-date-col">${escapeHTML(tx.date)}</td>
        <td class="tx-amount-col">${escapeHTML(tx.amount || tx.rawAmount || '-$130.15')}</td>
        <td class="tx-status-col">
          <span class="badge-status ${badgeClass}">${escapeHTML(tx.status)}</span>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// ---- Kontrol Perintah ESP32 ----
async function sendCommand(type, params = {}) {
  try {
    const res = await fetch(`${API_BASE}/command`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        type,
        params
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Perintah "${type}" berhasil dikirim ke antrean`, 'success');
      fetchTransactions();
      return true;
    } else {
      showToast(data.error || 'Gagal mengirim perintah', 'error');
      return false;
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan', 'error');
    return false;
  }
}

async function handleTare() {
  const btn = document.getElementById('btnTare');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Memproses Tare...';
  }
  const ok = await sendCommand('tare');
  if (btn) {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Withdraw Earning';
    }, 1200);
  }
  if (ok) closeControlModal();
}

async function handleCalibration() {
  const input = document.getElementById('inputCal');
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val) || val <= 0) {
    showToast('Masukkan faktor kalibrasi yang valid', 'error');
    return;
  }
  const ok = await sendCommand('set_calibration', { value: val });
  if (ok) {
    const disp = document.getElementById('currentCalDisplay');
    if (disp) disp.textContent = val.toFixed(1);
    localStorage.setItem('ecosort_cal', val);
    input.value = '';
    closeControlModal();
  }
}

async function handleInterval() {
  const input = document.getElementById('inputInterval');
  if (!input) return;
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val < 1 || val > 60) {
    showToast('Interval harus antara 1 sampai 60 detik', 'error');
    return;
  }
  const ok = await sendCommand('set_interval', { value: val });
  if (ok) {
    const disp = document.getElementById('currentIntervalDisplay');
    if (disp) disp.textContent = val + ' detik';
    localStorage.setItem('ecosort_interval', val);
    input.value = '';
    closeControlModal();
  }
}

async function handleRestart() {
  if (!confirm('Yakin ingin merestart ESP32 jarak jauh?')) return;
  const ok = await sendCommand('restart');
  if (ok) closeControlModal();
}

// ---- Inisialisasi Saat Halaman Dimuat ----
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Restore saved config
  const savedCal = localStorage.getItem('ecosort_cal');
  if (savedCal) {
    const disp = document.getElementById('currentCalDisplay');
    if (disp) disp.textContent = parseFloat(savedCal).toFixed(1);
  }
  const savedInt = localStorage.getItem('ecosort_interval');
  if (savedInt) {
    const disp = document.getElementById('currentIntervalDisplay');
    if (disp) disp.textContent = savedInt + ' detik';
  }

  // Initial fetch
  fetchDeviceStatus();
  fetchHistory();
  fetchTransactions();

  // Polling loops
  setInterval(fetchDeviceStatus, POLL_INTERVAL_MS);
  setInterval(fetchHistory, HISTORY_INTERVAL_MS);
  setInterval(fetchTransactions, TX_INTERVAL_MS);
});
