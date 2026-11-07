// ============================================================
//  EcoSort IoT Dashboard — App Logic
//  Data Riil Sensor ESP32, AI Chat, Analitik, Laporan, Akun
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
let currentAnalyticsRange = 'today';

// ---- Autentikasi ----
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
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('demo') || urlParams.has('test')) {
    localStorage.setItem(TOKEN_KEY, 'demo_test_token');
    return;
  }
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
//  NAVIGASI & VIEW SWITCHING (SEMUA HALAMAN TERINTEGRASI)
// ============================================================
function switchNav(viewName) {
  if (!viewName) viewName = 'dashboard';
  currentView = viewName;

  // Update URL Hash tanpa reload
  if (window.location.hash !== '#' + viewName) {
    window.history.replaceState(null, '', '#' + viewName);
  }

  // Set body class untuk kontrol responsif HP (panel profil hanya di dashboard)
  const isDashboard = (viewName === 'dashboard');
  document.body.classList.toggle('view-dashboard-active', isDashboard);
  document.body.classList.toggle('view-non-dashboard', !isDashboard);

  // Active status pada item sidebar / bottom bar
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById('nav-' + viewName);
  if (activeBtn) activeBtn.classList.add('active');

  // Toggle tampilan view dengan flex column penuh
  const views = ['dashboard', 'ai', 'analytics', 'reports', 'account'];
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) {
      if (v === viewName) {
        el.style.display = (v === 'dashboard') ? 'grid' : 'flex';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });

  // Handler spesifik tiap view
  if (viewName === 'dashboard') {
    setTimeout(() => {
      if (typeof resizeAllCharts === 'function') resizeAllCharts();
    }, 60);
  } else if (viewName === 'ai') {
    checkAIStatus();
    updateAIContextPills();
    scrollAIMessagesToBottom();
  } else if (viewName === 'analytics') {
    loadAnalyticsData(currentAnalyticsRange);
    setTimeout(() => {
      if (typeof resizeAllCharts === 'function') resizeAllCharts();
    }, 60);
  } else if (viewName === 'reports') {
    loadReportsData();
  } else if (viewName === 'account') {
    fetchUserProfile();
    loadDeviceToken();
  }

  closeNotifDropdown();
}

// ============================================================
//  PROFIL PENGGUNA & HALAMAN AKUN
// ============================================================
async function fetchUserProfile() {
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) return;

    const data = await res.json();

    const elName = document.getElementById('profileDisplayName');
    if (elName) elName.textContent = data.displayName || data.username || 'Admin EcoSort';

    const elInitial = document.getElementById('profileAvatarInitial');
    const elImg = document.getElementById('profileAvatarImg');
    if (data.avatar && data.avatar.trim()) {
      if (elImg) { elImg.src = data.avatar; elImg.style.display = 'block'; }
      if (elInitial) elInitial.style.display = 'none';
    } else {
      const nameParts = (data.displayName || data.username || 'AE').trim().split(' ');
      const initials = (nameParts[0][0] + (nameParts[1] ? nameParts[1][0] : nameParts[0][1] || '')).toUpperCase();
      if (elInitial) { elInitial.textContent = initials; elInitial.style.display = 'block'; }
      if (elImg) elImg.style.display = 'none';
    }

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

// Token Perangkat ESP32
async function loadDeviceToken() {
  try {
    const res = await fetch(`${API_BASE}/device-token`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const elCode = document.getElementById('accDeviceTokenDisplay');
    if (elCode && data.deviceToken) {
      elCode.textContent = data.deviceToken;
    }
  } catch (err) {
    console.error('Gagal mengambil token perangkat:', err);
  }
}

function copyDeviceToken() {
  const elCode = document.getElementById('accDeviceTokenDisplay');
  const btn = document.getElementById('btnCopyToken');
  if (!elCode) return;
  const token = elCode.textContent.trim();
  if (!token || token === 'Memuat...') return;

  navigator.clipboard.writeText(token).then(() => {
    showToast('Token perangkat berhasil disalin ke clipboard!', 'success');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Tersalin!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  }).catch(() => {
    showToast('Gagal menyalin token', 'error');
  });
}

// Data Demo & Reset Kosong
async function handleLoadDemo() {
  try {
    const res = await fetch(`${API_BASE}/demo-seed`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Data demo berhasil dimuat!', 'success');
      fetchDeviceStatus();
      fetchHistory();
      fetchTransactions();
      if (currentView === 'analytics') loadAnalyticsData(currentAnalyticsRange);
      if (currentView === 'reports') loadReportsData();
    } else {
      showToast(data.error || 'Gagal memuat data demo', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi jaringan', 'error');
  }
}

async function handleClearData() {
  if (!confirm('Kosongkan seluruh data riwayat? Keadaan akan kembali bersih (jujur kosong).')) return;
  try {
    const res = await fetch(`${API_BASE}/clear-data`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Seluruh data telah dikosongkan.', 'success');
      lastDeviceData = null;
      fetchDeviceStatus();
      fetchHistory();
      fetchTransactions();
      if (currentView === 'analytics') loadAnalyticsData(currentAnalyticsRange);
      if (currentView === 'reports') loadReportsData();
    } else {
      showToast(data.error || 'Gagal membersihkan data', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi jaringan', 'error');
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

    // Titik merah HANYA muncul jika ada notifikasi belum dibaca
    const redDot = document.getElementById('notifRedDot');
    if (redDot) {
      redDot.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const container = document.getElementById('notifListContainer');
    if (container && list.length > 0) {
      container.innerHTML = list.map(n => {
        const dotColor = n.type === 'danger' ? '#ef4444' : n.type === 'warning' ? '#f59e0b' : '#22c55e';
        return `
          <div class="notif-item ${n.unread ? 'unread' : ''}">
            <span class="notif-dot-status" style="background-color: ${dotColor};"></span>
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
async function checkAIStatus() {
  try {
    const res = await fetch('/api/ai/status', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const badgeText = document.getElementById('aiConfigText');
    const badge = document.getElementById('aiConfigBadge');
    if (badgeText) {
      if (data.configured) {
        badgeText.textContent = 'AI Ready';
        if (badge) badge.style.backgroundColor = 'rgba(116, 199, 24, 0.15)';
      } else {
        badgeText.textContent = 'Mode Data';
        if (badge) badge.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
      }
    }
  } catch (_) {}
}

function updateAIContextPills() {
  // Status bar pada AI chat telah dihilangkan sesuai permintaan (hanya menyisakan chat murni)
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

  appendChatMessage('user', msg);
  input.value = '';

  if (btn) btn.disabled = true;

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
//  HALAMAN ANALITIK (GRAFIK RISET & METRIK LENGKAP)
// ============================================================
function setAnalyticsRange(range) {
  currentAnalyticsRange = range;
  const btnToday = document.getElementById('btnRangeToday');
  const btn7d = document.getElementById('btnRange7d');
  if (btnToday) btnToday.classList.toggle('active', range === 'today');
  if (btn7d) btn7d.classList.toggle('active', range !== 'today');
  loadAnalyticsData(range);
}

async function loadAnalyticsData(range = 'today') {
  try {
    const res = await fetch(`${API_BASE}/analytics?deviceId=${DEVICE_ID}&range=${range}`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const mAvg = document.getElementById('metricAvgWeight');
    const mPeak = document.getElementById('metricPeakWeight');
    const mEv = document.getElementById('metricTotalEvents');
    const mHr = document.getElementById('metricBusiestHour');

    if (mAvg) mAvg.textContent = data.metrics?.avgWeight || '-- g';
    if (mPeak) mPeak.textContent = data.metrics?.peakWeight || '-- g';
    if (mEv) mEv.textContent = `${data.metrics?.totalEvents || 0} kali`;
    if (mHr) mHr.textContent = data.metrics?.busiestHour || '--';

    if (typeof updateAnalyticsCharts === 'function') {
      updateAnalyticsCharts(data);
    }
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

// ============================================================
//  HALAMAN LAPORAN (RINGKASAN & TABEL LOG LENGKAP)
// ============================================================
async function loadReportsData() {
  try {
    const [resDev, resTx] = await Promise.all([
      fetch(`${API_BASE}/devices`, { headers: authHeaders() }),
      fetch(`${API_BASE}/transactions`, { headers: authHeaders() })
    ]);

    const devData = await resDev.json();
    const txData = await resTx.json();

    const dev = (devData.devices || []).find(d => d.deviceId === DEVICE_ID) || devData.devices?.[0];
    const txList = txData.transactions || [];

    // Ringkasan
    const repTot = document.getElementById('repTotalWeight');
    const totW = dev?.totalWeightGram || 0;
    if (repTot) {
      repTot.textContent = totW >= 1000 ? `${(totW / 1000).toFixed(2)} kg` : `${Number(totW).toFixed(1)} g`;
    }

    const repEv = document.getElementById('repTotalEvents');
    if (repEv) repEv.textContent = `${txList.length} kejadian`;

    const repStat = document.getElementById('repDeviceStatus');
    const now = Date.now();
    const lastSeenTime = new Date(dev?.lastSeen || 0).getTime();
    const isOnline = dev && (now - lastSeenTime) < 10000;
    if (repStat) {
      repStat.textContent = isOnline ? 'Online' : 'Offline';
      repStat.style.color = isOnline ? '#22c55e' : '#ef4444';
    }

    const badgeCount = document.getElementById('repLogCountBadge');
    if (badgeCount) badgeCount.textContent = `${txList.length} Data`;

    // Render tabel laporan
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    if (txList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">
            Belum ada catatan log aktivitas tersimpan
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = txList.map(tx => {
      let badgeClass = 'badge-completed';
      let statusLabel = 'Selesai';
      const st = (tx.status || '').toLowerCase();
      if (st.includes('pending') || st.includes('menunggu')) {
        badgeClass = 'badge-pending';
        statusLabel = 'Menunggu';
      } else if (st.includes('scheduled') || st.includes('terkirim')) {
        badgeClass = 'badge-scheduled';
        statusLabel = 'Terkirim';
      }

      return `
        <tr>
          <td class="tx-date-col">${escapeHTML(tx.date)}</td>
          <td>
            <div class="tx-id-col">
              <div class="tx-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7z"/></svg>
              </div>
              <span>${escapeHTML(tx.id)}</span>
            </div>
          </td>
          <td class="tx-amount-col">${escapeHTML(tx.rawAmount || tx.amount || '0.0 g')}</td>
          <td>${escapeHTML(tx.distance || '--')}</td>
          <td class="tx-status-col">
            <span class="badge-status ${badgeClass}">${statusLabel}</span>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

// Ekspor File Laporan (CSV & JSON)
async function exportDataCSV() {
  try {
    const res = await fetch(`${API_BASE}/export/csv`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Gagal mengunduh CSV');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosort-log-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('File CSV berhasil diunduh!', 'success');
  } catch (err) {
    showToast('Gagal mengekspor data CSV', 'error');
  }
}

async function exportDataJSON() {
  try {
    const res = await fetch(`${API_BASE}/export/json`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Gagal mengunduh JSON');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosort-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('File JSON berhasil diunduh!', 'success');
  } catch (err) {
    showToast('Gagal mengekspor data JSON', 'error');
  }
}

// ============================================================
//  POLLING DATA SENSOR IOT REAL-TIME ("DATA JUJUR")
// ============================================================
async function fetchDeviceStatus() {
  try {
    const res = await fetch(`${API_BASE}/devices`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    const dev = (data.devices || []).find(d => d.deviceId === DEVICE_ID) || data.devices?.[0];

    // Jika belum ada data dari ESP32 (keadaan jujur belum pernah kirim data)
    if (!dev || !dev.lastSeen) {
      const elW = document.getElementById('valWeight');
      if (elW) elW.innerHTML = `--<span class="hero-unit">g</span>`;
      const elTrendW = document.getElementById('weightTrend');
      if (elTrendW) elTrendW.textContent = '--';

      const elD = document.getElementById('valDistance');
      if (elD) elD.innerHTML = `--<span class="hero-unit">cm</span>`;
      const elTrendD = document.getElementById('distanceTrend');
      if (elTrendD) elTrendD.textContent = 'HC-SR04';

      const elS = document.getElementById('valStatus');
      if (elS) elS.textContent = 'MENUNGGU';

      const elEarn = document.getElementById('earningAmount');
      if (elEarn) elEarn.textContent = '0.0 g';

      const elDot = document.getElementById('statusOnlineDot');
      if (elDot) elDot.className = 'status-online-dot offline';

      const elProfileStatus = document.getElementById('profileDeviceStatusText');
      if (elProfileStatus) elProfileStatus.textContent = 'esp32-ecosort-1 • Offline';

      const badgeAcc = document.getElementById('accDeviceOnlineBadge');
      if (badgeAcc) {
        badgeAcc.className = 'badge-status badge-pending';
        badgeAcc.textContent = 'Offline';
      }

      const elM3 = document.getElementById('profileMetric3');
      if (elM3) elM3.textContent = 'Offline';

      const capText = document.getElementById('profileCapacityText');
      if (capText) capText.textContent = '0%';
      const capFill = document.getElementById('profileCapacityFill');
      if (capFill) capFill.style.width = '0%';

      if (typeof updateDonutChartData === 'function') updateDonutChartData(0);
      updateAIContextPills();
      return;
    }

    lastDeviceData = dev;
    emptyDist = dev.emptyDistanceCm || 35;
    fullThresh = dev.fullThresholdCm || 10;

    const now = Date.now();
    const lastSeenTime = new Date(dev.lastSeen || 0).getTime();
    const isOnline = (now - lastSeenTime) < 10000;

    // Format jam terakhir untuk data jujur saat offline
    const dSeen = new Date(lastSeenTime);
    const hh = String(dSeen.getHours()).padStart(2, '0');
    const mm = String(dSeen.getMinutes()).padStart(2, '0');
    const lastSeenClockLabel = `Terakhir ${hh}.${mm}`;

    // 1. Kartu 1: Berat Sensor
    const weightVal = dev.currentWeightGram ?? dev.weightGram ?? 0;
    const elWeight = document.getElementById('valWeight');
    if (elWeight) {
      elWeight.innerHTML = `${Number(weightVal).toFixed(1)}<span class="hero-unit">g</span>`;
    }
    const elTrendW = document.getElementById('weightTrend');
    if (elTrendW) {
      elTrendW.textContent = isOnline ? 'Live' : lastSeenClockLabel;
    }

    // 2. Kartu 2: Jarak Sensor (distanceCm)
    const distVal = dev.distanceCm;
    const elDist = document.getElementById('valDistance');
    if (elDist) {
      if (distVal !== null && distVal !== undefined) {
        elDist.innerHTML = `${Number(distVal).toFixed(1)}<span class="hero-unit">cm</span>`;
      } else {
        elDist.innerHTML = `Err<span class="hero-unit">cm</span>`;
      }
    }
    const elTrendD = document.getElementById('distanceTrend');
    if (elTrendD) {
      elTrendD.textContent = isOnline ? 'HC-SR04' : lastSeenClockLabel;
    }

    // 3. Kartu 3: Status Sampah (PENUH / AMAN / SENSOR ERROR)
    const elStatus = document.getElementById('valStatus');
    let statusText = 'AMAN';
    if (distVal === null || distVal === undefined) {
      statusText = 'SENSOR ERROR';
    } else if (distVal <= fullThresh) {
      statusText = 'PENUH';
    } else {
      statusText = 'AMAN';
    }
    if (elStatus) elStatus.textContent = statusText;

    // 4. Donut Kapasitas Tong (Persentase Isi)
    let fillPercent = 0;
    if (distVal !== null && distVal !== undefined) {
      const denom = (emptyDist - fullThresh) || 1;
      const num = emptyDist - distVal;
      fillPercent = Math.min(100, Math.max(0, Math.round((num / denom) * 100)));
    }
    if (typeof updateDonutChartData === 'function') {
      updateDonutChartData(fillPercent);
    }

    // Progress Bar Kapasitas di Panel Profil
    const capText = document.getElementById('profileCapacityText');
    if (capText) capText.textContent = `${fillPercent}%`;
    const capFill = document.getElementById('profileCapacityFill');
    if (capFill) capFill.style.width = `${fillPercent}%`;

    // 5. Panel Profile (Kanan)
    const elDot = document.getElementById('statusOnlineDot');
    if (elDot) {
      elDot.className = isOnline ? 'status-online-dot' : 'status-online-dot offline';
    }

    const elProfileStatus = document.getElementById('profileDeviceStatusText');
    if (elProfileStatus) {
      elProfileStatus.textContent = `esp32-ecosort-1 • ${isOnline ? 'Online' : lastSeenClockLabel}`;
    }

    const badgeAcc = document.getElementById('accDeviceOnlineBadge');
    if (badgeAcc) {
      badgeAcc.className = isOnline ? 'badge-status badge-completed' : 'badge-status badge-pending';
      badgeAcc.textContent = isOnline ? 'Online' : 'Offline';
    }

    // 3 Angka Metrik Profile Riil:
    const totW = dev.totalWeightGram || 0;
    const elM1 = document.getElementById('profileMetric1');
    if (elM1) {
      if (totW >= 1000) {
        elM1.textContent = (totW / 1000).toFixed(1) + 'kg';
      } else {
        elM1.textContent = Number(totW).toFixed(0) + 'g';
      }
    }

    const elM3 = document.getElementById('profileMetric3');
    if (elM3) {
      const diffSec = Math.floor((now - lastSeenTime) / 1000);
      if (isOnline) {
        elM3.textContent = diffSec <= 2 ? 'Live' : diffSec + 's lalu';
      } else {
        elM3.textContent = 'Offline';
      }
    }

    // 6. Kartu Earning -> Total Berat Terkumpul
    const elEarning = document.getElementById('earningAmount');
    if (elEarning) {
      if (totW >= 1000) {
        elEarning.textContent = `${(totW / 1000).toFixed(2)} kg`;
      } else {
        elEarning.textContent = `${Number(totW).toFixed(1)} g`;
      }
    }

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

    renderTransactions(list);
  } catch (err) {
    console.error('Error fetching transactions:', err);
  }
}

function renderTransactions(list) {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">
          Belum ada riwayat penimbangan tercatat
        </td>
      </tr>
    `;
    return;
  }

  const html = list.slice(0, 4).map(tx => {
    let badgeClass = 'badge-completed';
    let statusLabel = 'Selesai';
    const st = (tx.status || '').toLowerCase();
    if (st.includes('pending') || st.includes('menunggu')) {
      badgeClass = 'badge-pending';
      statusLabel = 'Menunggu';
    } else if (st.includes('scheduled') || st.includes('terkirim')) {
      badgeClass = 'badge-scheduled';
      statusLabel = 'Terkirim';
    }

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
        <td class="tx-amount-col">${escapeHTML(tx.rawAmount || tx.amount || '0.0 g')}</td>
        <td class="tx-status-col">
          <span class="badge-status ${badgeClass}">${statusLabel}</span>
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
      btn.textContent = 'Tare / Reset Timbangan';
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

// ============================================================
//  INISIALISASI SAAT HALAMAN DIMUAT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

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

  fetchUserProfile();
  fetchDeviceStatus();
  fetchHistory();
  fetchTransactions();
  fetchNotifications();
  checkAIStatus();

  // Buka view sesuai hash jika ada (#ai, #analytics, #reports, #account, #kontrol), default dashboard
  const initialHash = window.location.hash.replace('#', '').trim();
  if (initialHash === 'control' || initialHash === 'kontrol') {
    switchNav('dashboard');
    setTimeout(openControlModal, 150);
  } else {
    switchNav(['dashboard', 'ai', 'analytics', 'reports', 'account'].includes(initialHash) ? initialHash : 'dashboard');
  }

  // Polling berkala
  setInterval(fetchDeviceStatus, POLL_INTERVAL_MS);
  setInterval(fetchHistory, HISTORY_INTERVAL_MS);
  setInterval(fetchTransactions, TX_INTERVAL_MS);
  setInterval(fetchNotifications, NOTIF_INTERVAL_MS);
});
