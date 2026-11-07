// ============================================================
//  Creativilo / EcoSort IoT Dashboard — App Logic
//  Fitur: Dashboard, AI Chat, Akun, Notifikasi Nyata, Kontrol
// ============================================================

const API_BASE = '/api/iot';
const TOKEN_KEY = 'ecosort_token';
const DEVICE_ID = 'esp32-ecosort-1';

// Polling intervals
const POLL_INTERVAL_MS = 2000;
const HISTORY_INTERVAL_MS = 5000;
const TX_INTERVAL_MS = 4000;
const NOTIF_INTERVAL_MS = 6000;

// State
let lastDeviceData = null;
let emptyDist = 35;
let fullThresh = 10;
let currentView = 'dashboard';
let currentTxCount = 0;

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

// ============================================================
//  VIEW SWITCHING & NAVIGATION (Dashboard, AI, Akun, dll)
// ============================================================
function switchNav(viewName) {
  currentView = viewName;

  // Update active state di menu sidebar & bottom bar
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById('nav-' + viewName);
  if (activeBtn) activeBtn.classList.add('active');

  // Sembunyikan semua view, tampilkan yang dipilih
  const views = ['dashboard', 'ai', 'analytics', 'reports', 'account'];
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) {
      if (v === viewName) {
        el.style.display = 'flex';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });

  // Jika kembali ke dashboard, refresh chart agar ukurannya akurat
  if (viewName === 'dashboard') {
    setTimeout(() => {
      if (window.revenueChartInstance) window.revenueChartInstance.resize();
      if (window.donutChartInstance) window.donutChartInstance.resize();
    }, 50);
  } else if (viewName === 'account') {
    fetchUserProfile();
  } else if (viewName === 'ai') {
    updateAIContextPills();
    scrollAIMessagesToBottom();
  }

  // Tutup dropdown notifikasi jika terbuka
  closeNotifDropdown();
}

// ============================================================
//  PROFIL AKUN & HALAMAN AKUN
// ============================================================
async function fetchUserProfile() {
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) return;

    const data = await res.json();

    // 1. Update panel profil di kanan
    const elName = document.getElementById('profileDisplayName');
    if (elName) elName.textContent = data.displayName || data.username || 'Admin EcoSort';

    const elInitial = document.getElementById('profileAvatarInitial');
    const elImg = document.getElementById('profileAvatarImg');
    if (data.avatar && data.avatar.trim()) {
      if (elImg) { elImg.src = data.avatar; elImg.style.display = 'block'; }
      if (elInitial) elInitial.style.display = 'none';
    } else {
      // Tampilkan inisial 2 huruf
      const nameParts = (data.displayName || data.username || 'AD').trim().split(' ');
      const initials = (nameParts[0][0] + (nameParts[1] ? nameParts[1][0] : nameParts[0][1] || '')).toUpperCase();
      if (elInitial) { elInitial.textContent = initials; elInitial.style.display = 'block'; }
      if (elImg) elImg.style.display = 'none';
    }

    // 2. Update form di Halaman Akun
    const inputDisplay = document.getElementById('accDisplayName');
    if (inputDisplay) inputDisplay.value = data.displayName || '';

    const inputUser = document.getElementById('accUsername');
    if (inputUser) inputUser.value = data.username || '';

    const inputRole = document.getElementById('accRole');
    if (inputRole) inputRole.value = data.role || 'Administrator';

  } catch (err) {
    console.error('Error fetching user profile:', err);
  }
}

// Simpan Perubahan Profil
async function handleSaveProfile(e) {
  e.preventDefault();
  const inputDisplay = document.getElementById('accDisplayName');
  const btn = document.getElementById('btnSaveProfile');
  if (!inputDisplay) return;

  const displayName = inputDisplay.value.trim();
  if (!displayName) {
    showToast('Nama tampilan tidak boleh kosong', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ displayName })
    });
    const result = await res.json();
    if (res.ok) {
      showToast('Profil berhasil diperbarui!', 'success');
      fetchUserProfile();
    } else {
      showToast(result.error || 'Gagal menyimpan profil', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi jaringan', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Profil'; }
  }
}

// Ubah Password Akun
async function handleChangePassword(e) {
  e.preventDefault();
  const oldPass = document.getElementById('accOldPass').value;
  const newPass = document.getElementById('accNewPass').value;
  const confirmPass = document.getElementById('accConfirmPass').value;
  const btn = document.getElementById('btnChangePass');

  if (newPass !== confirmPass) {
    showToast('Konfirmasi password tidak cocok', 'error');
    return;
  }
  if (newPass.length < 6) {
    showToast('Password baru minimal 6 karakter', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Memperbarui...'; }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
    });
    const result = await res.json();
    if (res.ok) {
      showToast('Password berhasil diubah!', 'success');
      document.getElementById('accOldPass').value = '';
      document.getElementById('accNewPass').value = '';
      document.getElementById('accConfirmPass').value = '';
    } else {
      showToast(result.error || 'Gagal mengubah password', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi jaringan', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Perbarui Password'; }
  }
}

// ============================================================
//  NOTIFIKASI SISTEM NYATA
// ============================================================
async function fetchNotifications() {
  try {
    const res = await fetch(`${API_BASE}/notifications`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.notifications || [];
    const unreadCount = data.unreadCount || 0;

    // Titik merah pada lonceng
    const redDot = document.getElementById('notifRedDot');
    if (redDot) {
      redDot.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    // Render isi dropdown
    const container = document.getElementById('notifListContainer');
    if (container && list.length > 0) {
      container.innerHTML = list.map(n => {
        const dotColor = n.type === 'danger' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : 'bg-green-500';
        return `
          <div class="notif-item ${n.unread ? 'unread' : ''}">
            <span class="notif-dot-status ${dotColor}" style="background-color: ${n.type === 'danger' ? '#ef4444' : n.type === 'warning' ? '#f59e0b' : '#22c55e'};"></span>
            <div class="notif-item-body">
              <strong>${escapeHTML(n.title)}</strong>
              <p>${escapeHTML(n.message)}</p>
              <small>${escapeHTML(n.time)}</small>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

function toggleNotifDropdown(event) {
  if (event) event.stopPropagation();
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.classList.toggle('open');
}

function closeNotifDropdown() {
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.classList.remove('open');
}

function clearNotifBadge() {
  const redDot = document.getElementById('notifRedDot');
  if (redDot) redDot.style.display = 'none';
  document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
  showToast('Semua notifikasi telah ditandai dibaca', 'success');
}

// Tutup dropdown jika klik di luar
window.addEventListener('click', (e) => {
  const dd = document.getElementById('notifDropdown');
  const btn = document.getElementById('btnNotifToggle');
  if (dd && !dd.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
    closeNotifDropdown();
  }
});

// ============================================================
//  AI CHAT ASSISTANT
// ============================================================
function updateAIContextPills() {
  if (!lastDeviceData) return;
  const elFill = document.getElementById('aiFillText');
  const elWeight = document.getElementById('aiWeightText');
  const elDev = document.getElementById('aiDevText');
  const elDot = document.getElementById('aiDevDot');

  const w = lastDeviceData.currentWeightGram ?? lastDeviceData.weightGram ?? 0;
  if (elWeight) elWeight.textContent = `${Number(w).toFixed(1)} g`;

  const distVal = lastDeviceData.distanceCm;
  let pct = 37;
  if (distVal !== null && distVal !== undefined) {
    const denom = (emptyDist - fullThresh) || 1;
    pct = Math.min(100, Math.max(0, Math.round(((emptyDist - distVal) / denom) * 100)));
  }
  if (elFill) elFill.textContent = `${pct}%`;

  const isOnline = (Date.now() - new Date(lastDeviceData.lastSeen || 0).getTime()) < 10000;
  if (elDev) elDev.textContent = `esp32-ecosort-1: ${isOnline ? 'Online' : 'Offline'}`;
  if (elDot) elDot.style.backgroundColor = isOnline ? '#22c55e' : '#ef4444';
}

function askQuickPrompt(text) {
  const input = document.getElementById('aiInputText');
  if (input) {
    input.value = text;
    handleSendAIMessage(new Event('submit'));
  }
}

function scrollAIMessagesToBottom() {
  const wrap = document.getElementById('aiMessagesWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

async function handleSendAIMessage(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('aiInputText');
  const btn = document.getElementById('btnSendAI');
  if (!input) return;

  const msg = input.value.trim();
  if (!msg) return;

  // Append pesan user
  appendChatMessage('user', msg);
  input.value = '';

  if (btn) btn.disabled = true;

  // Tampilkan loading placeholder
  const loadingId = 'loading-' + Date.now();
  appendChatLoading(loadingId);
  scrollAIMessagesToBottom();

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    removeChatLoading(loadingId);

    if (data.reply) {
      appendChatMessage('ai', data.reply);
    } else {
      appendChatMessage('ai', 'Maaf, terjadi kesalahan saat memproses jawaban.');
    }

    // Jika AI belum dikonfigurasi, beri indikator kecil
    const badge = document.getElementById('aiConfigText');
    if (badge && data.configured === false) {
      badge.textContent = 'Mode Data Cerdas';
    }
  } catch (err) {
    removeChatLoading(loadingId);
    appendChatMessage('ai', 'Maaf, gagal menghubungi server AI.');
  } finally {
    if (btn) btn.disabled = false;
    scrollAIMessagesToBottom();
  }
}

function appendChatMessage(sender, text) {
  const wrap = document.getElementById('aiMessagesWrap');
  if (!wrap) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg msg-${sender}`;

  const formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  if (sender === 'ai') {
    msgDiv.innerHTML = `
      <div class="msg-avatar">
        <svg viewBox="0 0 24 24"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>
      </div>
      <div class="msg-bubble">
        <div class="msg-sender">EcoSort AI</div>
        <div class="msg-text">${formattedText}</div>
      </div>
    `;
  } else {
    msgDiv.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-text">${escapeHTML(text)}</div>
      </div>
    `;
  }

  wrap.appendChild(msgDiv);
  scrollAIMessagesToBottom();
}

function appendChatLoading(id) {
  const wrap = document.getElementById('aiMessagesWrap');
  if (!wrap) return;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'chat-msg msg-ai';
  div.innerHTML = `
    <div class="msg-avatar">
      <svg viewBox="0 0 24 24"><path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>
    </div>
    <div class="msg-bubble" style="color: #64748b;">
      <em>Menganalisis data IoT...</em>
    </div>
  `;
  wrap.appendChild(div);
}

function removeChatLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ============================================================
//  POLLING DATA SENSOR IOT (Live Current State)
// ============================================================
async function fetchDeviceStatus() {
  try {
    const res = await fetch(`${API_BASE}/devices`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
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
    let fillPercent = 37;
    if (distVal !== null && distVal !== undefined) {
      const denom = (emptyDist - fullThresh) || 1;
      const num = emptyDist - distVal;
      fillPercent = Math.min(100, Math.max(0, Math.round((num / denom) * 100)));
    }
    if (typeof updateDonutChartData === 'function') {
      updateDonutChartData(fillPercent);
    }
    const statAvg = document.getElementById('statCapacityAvg');
    if (statAvg) statAvg.textContent = `${fillPercent}%`;

    // 5. Panel Profile (Kanan Atas)
    const now = Date.now();
    const lastSeenTime = new Date(dev.lastSeen || 0).getTime();
    const isOnline = (now - lastSeenTime) < 10000;

    const elDot = document.getElementById('statusOnlineDot');
    if (elDot) {
      elDot.className = isOnline ? 'status-online-dot' : 'status-online-dot offline';
    }

    const elProfileStatus = document.getElementById('profileDeviceStatusText');
    if (elProfileStatus) {
      elProfileStatus.textContent = `esp32-ecosort-1 • ${isOnline ? 'Online' : 'Offline'}`;
    }

    const badgeAcc = document.getElementById('accDeviceOnlineBadge');
    if (badgeAcc) {
      badgeAcc.className = isOnline ? 'badge-status badge-completed' : 'badge-status badge-pending';
      badgeAcc.textContent = isOnline ? 'Online' : 'Offline';
    }

    // 3 Angka Kecil Metrik Profile (Data Nyata):
    const totW = dev.totalWeightGram || 0;
    const elM1 = document.getElementById('profileMetric1');
    if (elM1) {
      if (totW >= 1000) {
        elM1.textContent = (totW / 1000).toFixed(1) + 'kg';
      } else {
        elM1.textContent = Number(totW).toFixed(0) + 'g';
      }
    }
    const repTot = document.getElementById('repTotalWeight');
    if (repTot) repTot.textContent = (totW / 1000).toFixed(2) + ' kg';

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

    // Update context pills di view AI
    updateAIContextPills();

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
    currentTxCount = list.length;

    const elM2 = document.getElementById('profileMetric2');
    if (elM2) elM2.textContent = String(currentTxCount);

    const elEvCount = document.getElementById('statEventCount');
    if (elEvCount) elEvCount.textContent = `${currentTxCount} kali`;

    renderTransactions(list);
  } catch (err) {
    console.error('Error fetching transactions:', err);
  }
}

// Hanya tampilkan 4 baris terbaru saja sesuai desain
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

// ============================================================
//  KONTROL PERINTAH ESP32 (Tare, Kalibrasi, Interval, Restart)
// ============================================================
function openControlModal() {
  const modal = document.getElementById('controlModal');
  if (modal) modal.classList.add('open');
}

function closeControlModal() {
  const modal = document.getElementById('controlModal');
  if (modal) modal.classList.remove('open');
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('controlModal');
  if (e.target === modal) closeControlModal();
});

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
      fetchNotifications();
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

// Ekspor Riwayat Data JSON
function exportDataJSON() {
  fetch(`${API_BASE}/history?deviceId=${DEVICE_ID}&limit=500`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecosort-history-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data sensor berhasil diekspor!', 'success');
    })
    .catch(() => showToast('Gagal mengekspor data', 'error'));
}

// ============================================================
//  INISIALISASI SAAT HALAMAN DIMUAT
// ============================================================
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

  // Load awal
  fetchUserProfile();
  fetchDeviceStatus();
  fetchHistory();
  fetchTransactions();
  fetchNotifications();

  // Polling loops
  setInterval(fetchDeviceStatus, POLL_INTERVAL_MS);
  setInterval(fetchHistory, HISTORY_INTERVAL_MS);
  setInterval(fetchTransactions, TX_INTERVAL_MS);
  setInterval(fetchNotifications, NOTIF_INTERVAL_MS);
});
