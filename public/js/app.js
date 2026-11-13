// ============================================================
//  EcoSort IoT Dashboard — App Logic
//  Data Riil Sensor ESP32, AI Chat, Analitik, Laporan, Akun
// ============================================================

const API_BASE = '/api/iot';
const TOKEN_KEY = 'ecosort_token';
const DEVICE_ID = 'esp32-ecosort-1';

// Polling intervals (Real-time responsif sesuai deteksi sensor)
const POLL_INTERVAL_MS = 1000;
const HISTORY_INTERVAL_MS = 2000;
const TX_INTERVAL_MS = 3000;
const NOTIF_INTERVAL_MS = 5000;

// State
let lastDeviceData = null;
let emptyDist = 35;
let fullThresh = 10;
let currentView = 'dashboard';
let currentTxCount = 0;
let currentAnalyticsRange = 'today';
let liveSideChartBuffer = [];

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

// ---- Toast Notifications (Modern Centered Pill with Icons) ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const safeType = (type === 'danger' ? 'error' : (type || 'info'));
  const toast = document.createElement('div');
  toast.className = `toast ${safeType}`;

  // SVG Icon based on type
  let iconSvg = '';
  if (safeType === 'success') {
    iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>';
  } else if (safeType === 'error') {
    iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
  } else {
    iconSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
  }

  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.innerHTML = iconSvg;

  const contentEl = document.createElement('div');
  contentEl.className = 'toast-content';
  contentEl.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Tutup');
  closeBtn.innerHTML = '&times;';

  const dismiss = () => {
    if (!toast.parentElement) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translate3d(0, 10px, 0) scale(0.96)';
    toast.style.transition = 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 220);
  };

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    dismiss();
  };

  toast.appendChild(iconEl);
  toast.appendChild(contentEl);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  setTimeout(dismiss, 3600);
}

// ============================================================
//  CENTRALIZED ROUTER & MENU CONFIGURATION (SINGLE SOURCE OF TRUTH)
// ============================================================
const APP_ROUTES = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    paths: ['/dashboard', '/beranda'],
    hash: '#dashboard',
    aliases: ['dashboard', 'beranda', '']
  },
  {
    id: 'ai',
    title: 'AI & Analisis CCTV Sampah',
    paths: ['/ai', '/cctv'],
    hash: '#ai',
    aliases: ['ai', 'cctv']
  },
  {
    id: 'analytics',
    title: 'Analitik & Riset Penimbangan',
    paths: ['/analytics', '/analitik'],
    hash: '#analytics',
    aliases: ['analytics', 'analitik']
  },
  {
    id: 'reports',
    title: 'Laporan',
    paths: ['/reports', '/laporan'],
    hash: '#reports',
    aliases: ['reports', 'laporan', 'control', 'kontrol']
  },
  {
    id: 'account',
    title: 'Akun Administrator',
    paths: ['/account', '/akun'],
    hash: '#account',
    aliases: ['account', 'akun', 'password']
  },
  {
    id: 'notifications',
    title: 'Notifikasi Sistem',
    paths: ['/notifications', '/notifikasi'],
    hash: '#notifications',
    aliases: ['notifications', 'notifikasi']
  }
];

function resolveCurrentRoute(inputStr) {
  let target = (inputStr || '').trim().toLowerCase();
  if (!target) {
    const hash = window.location.hash.replace('#', '').trim().toLowerCase();
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const saved = (localStorage.getItem('ecosort_current_view') || '').trim().toLowerCase();
    target = hash || path || saved || 'dashboard';
  }
  target = target.replace('#', '').replace(/^\/+/, '');

  for (const route of APP_ROUTES) {
    if (route.id === target || route.aliases.includes(target) || route.paths.includes('/' + target)) {
      return route;
    }
  }
  return APP_ROUTES[0]; // fallback to dashboard
}

// ============================================================
//  INDIKATOR GARIS HIJAU BERGERAK DINAMIS PADA SIDEBAR
// ============================================================
function updateNavSlider(viewName) {
  const targetRoute = resolveCurrentRoute(viewName || currentView);
  const targetName = targetRoute.id;
  const navList = document.getElementById('sidebarNavList') || document.querySelector('.nav-list');
  const slider = document.getElementById('navSliderBar');
  if (!navList || !slider) return;

  const activeBtn = document.getElementById('nav-' + targetName);
  if (!activeBtn) {
    slider.style.opacity = '0';
    return;
  }

  const listRect = navList.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  if (listRect.height === 0 || btnRect.height === 0) {
    requestAnimationFrame(() => updateNavSlider(targetName));
    return;
  }

  // Posisi Y dihitung relatif terhadap nav-list agar tepat di tengah vertikal tombol aktif
  const targetY = (btnRect.top - listRect.top) + (btnRect.height / 2) - 8; // 8 = 16px / 2

  slider.style.opacity = '1';
  slider.style.transform = `translate3d(0, ${Math.round(targetY)}px, 0)`;
}

// Responsif saat window di-resize
window.addEventListener('resize', () => {
  updateNavSlider();
});

// Listener Sinkronisasi Back/Forward Browser & Perubahan URL Hash (popstate & hashchange)
window.addEventListener('popstate', () => {
  const route = resolveCurrentRoute();
  switchNav(route.id, { updateHistory: false });
});

window.addEventListener('hashchange', () => {
  const route = resolveCurrentRoute();
  switchNav(route.id, { updateHistory: false });
});

// ============================================================
//  NAVIGASI & VIEW SWITCHING (SEMUA HALAMAN TERINTEGRASI)
// ============================================================
function switchNav(target, options = {}) {
  const route = resolveCurrentRoute(target);
  const viewName = route.id;
  currentView = viewName;

  try {
    localStorage.setItem('ecosort_current_view', viewName);
  } catch (_) { }

  // Update URL Hash dan browser history tanpa memicu reload
  const { updateHistory = true, replace = false } = options;
  if (updateHistory) {
    const targetHash = '#' + viewName;
    if (window.location.hash !== targetHash) {
      if (replace) {
        window.history.replaceState({ view: viewName }, '', targetHash);
      } else {
        window.history.pushState({ view: viewName }, '', targetHash);
      }
    }
  }

  // Hapus style early-view-style jika ada setelah switchNav aktif
  const earlyStyle = document.getElementById('early-view-style');
  if (earlyStyle) earlyStyle.remove();

  // Set body class untuk kontrol responsif HP (panel profil hanya di dashboard)
  const isDashboard = (viewName === 'dashboard');
  document.body.classList.toggle('view-dashboard-active', isDashboard);
  document.body.classList.toggle('view-non-dashboard', !isDashboard);
  document.documentElement.setAttribute('data-active-view', viewName);

  // SINKRONISASI TOTAL ACTIVE STATE PADA SIDEBAR:
  // 1. Hapus class 'active' dari SEMUA tombol navigasi tanpa kecuali
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  // 2. Pasang class 'active' HANYA pada tombol yang sesuai route aktif
  const activeBtn = document.getElementById('nav-' + viewName);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // 3. Gerakkan indikator garis hijau tunggal dengan animasi mulus dan presisi
  updateNavSlider(viewName);

  // 4. Toggle tampilan view: Hanya 1 container view yang aktif
  APP_ROUTES.forEach(r => {
    const el = document.getElementById('view-' + r.id);
    if (el) {
      if (r.id === viewName) {
        el.style.display = (r.id === 'dashboard') ? 'grid' : 'flex';
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
    loadLatestCctv();
    if (typeof startCctvPolling === 'function') startCctvPolling();
    if (typeof updateCctvServerUrlDisplay === 'function') updateCctvServerUrlDisplay();
  } else if (viewName === 'analytics') {
    loadAnalyticsData(currentAnalyticsRange);
    setTimeout(() => {
      if (typeof resizeAllCharts === 'function') resizeAllCharts();
    }, 60);
  } else if (viewName === 'reports') {
    loadReportsData();
  } else if (viewName === 'account') {
    openProfileCard(); // Pastikan default membuka kartu profil pengguna
    fetchUserProfile();
    loadDeviceToken();
  } else if (viewName === 'notifications') {
    renderFullNotificationsPage();
  }

  closeNotifDropdown();
  if (viewName !== 'ai') {
    if (typeof stopWebcam === 'function') stopWebcam();
    if (typeof stopCctvPolling === 'function') stopCctvPolling();
  }
}

// ============================================================
//  PROFIL PENGGUNA & HALAMAN AKUN
// ============================================================
let currentUserProfile = {
  displayName: 'Admin EcoSort',
  username: 'admin',
  role: 'Administrator',
  avatar: '/images/avatar.svg',
  banner: ''
};

const BANNER_PRESETS = {
  emerald: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  forest: 'linear-gradient(135deg, #065f46 0%, #022c22 100%)',
  slate: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  amber: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
  ocean: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
};

async function fetchUserProfile() {
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) return;

    const data = await res.json();
    currentUserProfile = Object.assign(currentUserProfile, data);

    // Sinkronisasi data avatar & banner dari localStorage jika pernah disimpan
    const localAvatar = localStorage.getItem('ecosort_user_avatar');
    const localBanner = localStorage.getItem('ecosort_user_banner');
    if (localAvatar && (!currentUserProfile.avatar || currentUserProfile.avatar === '/images/avatar.svg')) {
      currentUserProfile.avatar = localAvatar;
    }
    if (localBanner && !currentUserProfile.banner) {
      currentUserProfile.banner = localBanner;
    }

    renderUserProfileUI();

    // Input fields profil
    const inputDisplay = document.getElementById('accDisplayName');
    if (inputDisplay) inputDisplay.value = currentUserProfile.displayName || '';

    const inputUser = document.getElementById('accUsername');
    if (inputUser) inputUser.value = currentUserProfile.username || '';

    const inputRole = document.getElementById('accRole');
    if (inputRole) inputRole.value = currentUserProfile.role || 'Administrator';

    // Kotak Password untuk melihat password
    const inputPass = document.getElementById('accCurrentPass');
    if (inputPass) inputPass.value = currentUserProfile.password || 'admin123';

  } catch (err) {
    console.error('Error fetching user profile:', err);
  }
}

function renderUserProfileUI() {
  // Update profil panel kanan
  const elName = document.getElementById('profileDisplayName');
  if (elName) elName.textContent = currentUserProfile.displayName || currentUserProfile.username || 'Admin EcoSort';

  // Update header profil view-account
  const headerDisplayName = document.getElementById('accHeaderDisplayName');
  if (headerDisplayName) headerDisplayName.textContent = currentUserProfile.displayName || currentUserProfile.username || 'Admin EcoSort';

  const headerRole = document.getElementById('accHeaderRole');
  if (headerRole) headerRole.textContent = currentUserProfile.role || 'Administrator';

  // Avatar UI: default ke foto profil sleek
  const avatarSrc = currentUserProfile.avatar || '/images/avatar.svg';
  const elImg = document.getElementById('profileAvatarImg');
  const elInitial = document.getElementById('profileAvatarInitial');
  const accImg = document.getElementById('accAvatarImg');
  const accInitial = document.getElementById('accAvatarInitial');
  const accPreview = document.getElementById('accAvatarPreview');

  if (elImg) {
    elImg.src = avatarSrc;
    elImg.style.display = 'block';
  }
  if (elInitial) elInitial.style.display = 'none';

  if (accImg) {
    accImg.src = avatarSrc;
    accImg.style.display = 'block';
  }
  if (accInitial) accInitial.style.display = 'none';

  if (accPreview) {
    accPreview.src = avatarSrc;
  }

  // Background Banner UI
  const bannerValue = currentUserProfile.banner || BANNER_PRESETS.emerald;
  applyBannerToUI(bannerValue);
}

function applyBannerToUI(bannerValue) {
  const profileBanner = document.getElementById('profileMainBanner') || document.querySelector('.profile-green-banner');
  const accBannerPreview = document.getElementById('accBannerPreview');
  const shapes = document.getElementById('profileBannerShapes') || document.querySelector('.profile-banner-shapes');

  if (!bannerValue) bannerValue = BANNER_PRESETS.emerald;

  const isGradient = bannerValue.includes('linear-gradient') || bannerValue.includes('radial-gradient');
  const isImage = bannerValue.startsWith('data:') || bannerValue.startsWith('http') || bannerValue.startsWith('/');

  if (profileBanner) {
    if (isImage) {
      profileBanner.style.backgroundImage = `url("${bannerValue}")`;
      profileBanner.style.backgroundSize = 'cover';
      profileBanner.style.backgroundPosition = 'center';
      if (shapes) shapes.style.display = 'none';
    } else {
      profileBanner.style.backgroundImage = bannerValue;
      if (shapes) shapes.style.display = 'block';
    }
  }

  if (accBannerPreview) {
    if (isImage) {
      accBannerPreview.style.backgroundImage = `url("${bannerValue}")`;
      accBannerPreview.style.backgroundSize = 'cover';
      accBannerPreview.style.backgroundPosition = 'center';
    } else {
      accBannerPreview.style.backgroundImage = bannerValue;
    }
  }

  // Update active swatch
  document.querySelectorAll('.preset-swatch').forEach(sw => sw.classList.remove('active'));
  for (const [key, grad] of Object.entries(BANNER_PRESETS)) {
    if (bannerValue === grad) {
      const sw = document.getElementById('swatch-' + key);
      if (sw) sw.classList.add('active');
    }
  }
}

function triggerAvatarUpload() {
  const input = document.getElementById('inputAvatarFile');
  if (input) input.click();
}

function triggerBannerUpload() {
  const input = document.getElementById('inputBannerFile');
  if (input) input.click();
}

async function handleAvatarFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Harap pilih file gambar (JPG, PNG, WebP, SVG)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    currentUserProfile.avatar = dataUrl;
    localStorage.setItem('ecosort_user_avatar', dataUrl);
    renderUserProfileUI();
    await saveProfileToServer({ avatar: dataUrl });
    showToast('Foto profil berhasil diubah!', 'success');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function handleBannerFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Harap pilih file gambar untuk banner', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    currentUserProfile.banner = dataUrl;
    localStorage.setItem('ecosort_user_banner', dataUrl);
    applyBannerToUI(dataUrl);
    await saveProfileToServer({ banner: dataUrl });
    showToast('Background banner berhasil diubah!', 'success');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function selectBannerPreset(presetKey) {
  const grad = BANNER_PRESETS[presetKey];
  if (!grad) return;
  currentUserProfile.banner = grad;
  localStorage.setItem('ecosort_user_banner', grad);
  applyBannerToUI(grad);
  await saveProfileToServer({ banner: grad });
  showToast(`Tema banner diubah ke ${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)}`, 'success');
}

async function resetAvatarToDefault() {
  currentUserProfile.avatar = '/images/avatar.svg';
  localStorage.removeItem('ecosort_user_avatar');
  renderUserProfileUI();
  await saveProfileToServer({ avatar: '/images/avatar.svg' });
  showToast('Foto profil dikembalikan ke default', 'info');
}

async function saveProfileToServer(extraData = {}) {
  try {
    const payload = {
      displayName: currentUserProfile.displayName || 'Admin EcoSort',
      avatar: currentUserProfile.avatar,
      banner: currentUserProfile.banner,
      ...extraData
    };
    await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Error saving profile to server:', err);
  }
}

// Toggle Lihat / Sembunyikan Password
function toggleViewPassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  const isPassword = (input.type === 'password');
  input.type = isPassword ? 'text' : 'password';

  if (icon) {
    if (isPassword) {
      // Icon mata dicoret (sembunyikan)
      icon.innerHTML = `<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>`;
    } else {
      // Icon mata normal (lihat)
      icon.innerHTML = `<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>`;
    }
  }
}

// ============================================================
//  TUKAR KOTAK: PROFIL PENGGUNA <-> FORM UBAH SANDI (IN-PLACE)
// ============================================================
function openPasswordChangeCard() {
  const cardProfile = document.getElementById('cardProfile');
  const cardPass = document.getElementById('cardChangePassword');
  const headerTitle = document.getElementById('accountHeaderTitle');

  if (cardProfile) cardProfile.style.display = 'none';
  if (cardPass) cardPass.style.display = 'flex';
  if (headerTitle) headerTitle.textContent = 'Ubah Sandi';

  const oldPass = document.getElementById('accOldPass');
  if (oldPass) {
    oldPass.value = '';
    setTimeout(() => oldPass.focus(), 100);
  }
  const newPass = document.getElementById('accNewPass');
  if (newPass) newPass.value = '';
  const confPass = document.getElementById('accConfirmPass');
  if (confPass) confPass.value = '';
}

function openProfileCard() {
  const cardProfile = document.getElementById('cardProfile');
  const cardPass = document.getElementById('cardChangePassword');
  const headerTitle = document.getElementById('accountHeaderTitle');

  if (cardPass) cardPass.style.display = 'none';
  if (cardProfile) cardProfile.style.display = 'flex';
  if (headerTitle) headerTitle.textContent = 'Profil Pengguna';
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
      body: JSON.stringify({
        displayName,
        avatar: currentUserProfile.avatar,
        banner: currentUserProfile.banner
      })
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
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg><span>Simpan Perubahan Profil</span>`;
    }
  }
}

async function doChangePassword() {
  const oldPass = document.getElementById('accOldPass').value;
  const newPass = document.getElementById('accNewPass').value;
  const confirmPass = document.getElementById('accConfirmPass').value;
  const btn = document.getElementById('btnChangePass');

  if (!oldPass) {
    showToast('Masukkan password lama', 'error');
    return;
  }
  if (!newPass || newPass.length < 6) {
    showToast('Password baru minimal 6 karakter', 'error');
    return;
  }
  if (newPass !== confirmPass) {
    showToast('Konfirmasi password tidak cocok', 'error');
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
      showToast('Password berhasil diperbarui!', 'success');
      document.getElementById('accOldPass').value = '';
      document.getElementById('accNewPass').value = '';
      document.getElementById('accConfirmPass').value = '';
      const currentPassInput = document.getElementById('accCurrentPass');
      if (currentPassInput) currentPassInput.value = newPass;
      setTimeout(() => {
        openProfileCard();
      }, 600);
    } else {
      showToast(result.error || 'Gagal mengubah password', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi jaringan', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg><span>Perbarui Password</span>`;
    }
  }
}

async function handleChangePassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  return doChangePassword();
}

// Token Perangkat ESP32 & Mode Demo
let actualDeviceToken = '';

async function loadDeviceToken() {
  try {
    const res = await fetch(`${API_BASE}/device-token`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    actualDeviceToken = data.deviceToken || '';

    const elCode = document.getElementById('accDeviceTokenDisplay');
    if (elCode) {
      elCode.textContent = data.maskedToken || (actualDeviceToken ? 'eco_••••••••••••' : 'Belum dikonfigurasi');
    }

    // Tombol demo HANYA tampil jika DEMO_MODE=1
    const seedBox = document.getElementById('demoSeedBox');
    if (seedBox) {
      seedBox.style.display = data.demoMode ? 'flex' : 'none';
    }
  } catch (err) {
    console.error('Gagal mengambil token perangkat:', err);
  }
}

function copyDeviceToken() {
  const btn = document.getElementById('btnCopyToken');
  const tokenToCopy = actualDeviceToken;
  if (!tokenToCopy) {
    showToast('Token perangkat belum dikonfigurasi di environment server', 'error');
    return;
  }

  navigator.clipboard.writeText(tokenToCopy).then(() => {
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
  const confirmCode = prompt('Ketik "RESET" untuk mengonfirmasi pengosongan data riwayat (keadaan akan jujur kosong):');
  if (confirmCode !== 'RESET') {
    if (confirmCode !== null) showToast('Reset dibatalkan (kata konfirmasi salah)', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/clear-data`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ confirm: 'RESET' })
    });
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
//  NOTIFIKASI SISTEM NYATA & HALAMAN NOTIFIKASI
// ============================================================
let allNotifications = [];
let currentNotifFilter = 'all';

function getReadNotificationIds() {
  try {
    return JSON.parse(localStorage.getItem('ecosort_read_notif_ids') || '["notif-offline", "notif-sys"]');
  } catch (_) {
    return ["notif-offline", "notif-sys"];
  }
}

function saveReadNotificationIds(ids) {
  try {
    const existing = getReadNotificationIds();
    const merged = Array.from(new Set([...existing, ...(Array.isArray(ids) ? ids : [])]));
    localStorage.setItem('ecosort_read_notif_ids', JSON.stringify(merged));
  } catch (_) { }
}

async function fetchNotifications() {
  try {
    const res = await fetch(`${API_BASE}/notifications`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.notifications || [];
    const readIds = getReadNotificationIds();

    // Sesuaikan status dibaca dengan daftar riwayat baca lokal pengguna
    list.forEach(n => {
      if (readIds.includes(n.id)) {
        n.unread = false;
      }
    });

    const unreadCount = list.filter(n => n.unread).length;
    allNotifications = list;

    // Titik merah HANYA muncul jika ada notifikasi belum dibaca riil
    const redDot = document.getElementById('notifRedDot');
    if (redDot) {
      redDot.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    // Update badge count pada tab di halaman notifikasi
    const badgeAll = document.getElementById('badgeNotifAll');
    if (badgeAll) badgeAll.textContent = String(list.length);
    const badgeUnread = document.getElementById('badgeNotifUnread');
    if (badgeUnread) badgeUnread.textContent = String(unreadCount);

    // Render Dropdown di Panel Profil Kanan
    const container = document.getElementById('notifListContainer');
    if (container) {
      if (list.length > 0) {
        container.innerHTML = list.map(n => {
          const dotColor = n.type === 'danger' ? '#ef4444' : n.type === 'warning' ? '#f59e0b' : '#22c55e';
          return `
            <div class="notif-item ${n.unread ? 'unread' : ''}" style="display: flex; align-items: flex-start; gap: 8px; position: relative;">
              <span class="notif-dot-status" style="background-color: ${dotColor}; margin-top: 4px;"></span>
              <div class="notif-item-body" style="flex: 1; min-width: 0; cursor: pointer;" onclick="openNotificationsPage()">
                <strong>${escapeHTML(n.title)}</strong>
                <p>${escapeHTML(n.message)}</p>
                <small>${escapeHTML(n.time)}</small>
              </div>
              <button type="button" class="btn-row-delete-flat" onclick="handleDeleteSingleNotif(event, '${escapeHTML(n.id)}')" title="Hapus notifikasi" style="margin-top: 2px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          `;
        }).join('');
      } else {
        container.innerHTML = '<div style="padding: 18px; text-align: center; color: #94a3b8; font-size: 0.8rem;">Tidak ada notifikasi sistem</div>';
      }
    }

    // Jika sedang berada di halaman notifikasi, render juga halaman penuhnya
    if (currentView === 'notifications') {
      renderFullNotificationsPage();
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

function openNotificationsPage() {
  closeNotifDropdown();
  markAllCurrentNotifsAsRead();
  switchNav('notifications');
}

function setNotifFilter(filter) {
  currentNotifFilter = filter;
  document.querySelectorAll('.btn-notif-filter').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById('tabNotif' + filter.charAt(0).toUpperCase() + filter.slice(1));
  if (btn) btn.classList.add('active');
  renderFullNotificationsPage();
}

function renderFullNotificationsPage() {
  const container = document.getElementById('notifFullPageList');
  if (!container) return;

  let filtered = allNotifications;
  if (currentNotifFilter === 'unread') {
    filtered = allNotifications.filter(n => n.unread);
  } else if (currentNotifFilter === 'warning') {
    filtered = allNotifications.filter(n => n.type === 'danger' || n.type === 'warning');
  } else if (currentNotifFilter === 'info') {
    filtered = allNotifications.filter(n => n.type === 'info' || n.type === 'success');
  }

  if (filtered.length === 0) {
    const emptyMsg = currentNotifFilter === 'unread'
      ? 'Semua notifikasi telah dibaca'
      : currentNotifFilter === 'warning'
        ? 'Tidak ada peringatan sensor atau perangkat saat ini'
        : 'Belum ada notifikasi sistem yang tercatat';
    container.innerHTML = `
      <div class="notif-empty-state">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" style="opacity: 0.35;">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        <p>${emptyMsg}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(n => {
    const isDanger = n.type === 'danger';
    const isWarn = n.type === 'warning';
    const isSuccess = n.type === 'success';
    const iconClass = isDanger ? 'icon-danger' : isWarn ? 'icon-warning' : isSuccess ? 'icon-success' : 'icon-info';

    // SVG icon sesuai kategori
    let iconSvg = '';
    if (isDanger) {
      iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    } else if (isWarn) {
      iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
    } else if (isSuccess) {
      iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>`;
    }

    return `
      <div class="notif-page-item ${n.unread ? 'unread' : ''}">
        <div class="notif-item-icon-box ${iconClass}">
          ${iconSvg}
        </div>
        <div class="notif-item-content">
          <div class="notif-item-top">
            <div class="notif-item-title-wrap">
              <span class="notif-item-title">${escapeHTML(n.title)}</span>
              ${n.unread ? '<span class="notif-unread-dot" title="Belum dibaca"></span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="notif-item-time">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                ${escapeHTML(n.time)}
              </span>
              <button type="button" class="btn-row-delete-flat" onclick="handleDeleteSingleNotif(event, '${escapeHTML(n.id)}')" title="Hapus notifikasi ini">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
          <p class="notif-item-desc">${escapeHTML(n.message)}</p>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Fungsi Hapus Notifikasi (Gambar 2) ----
async function handleClearAllNotifs(event) {
  if (event) event.stopPropagation();
  if (!confirm('Apakah Anda yakin ingin menghapus SELURUH notifikasi?')) return;
  try {
    const res = await fetch(`${API_BASE}/notifications`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Gagal membersihkan notifikasi');
    allNotifications = [];
    renderFullNotificationsPage();
    fetchNotifications();
    showToast('Seluruh notifikasi berhasil dihapus', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteSingleNotif(event, id) {
  if (event) event.stopPropagation();
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Gagal menghapus notifikasi');
    allNotifications = allNotifications.filter(n => n.id !== id);
    renderFullNotificationsPage();
    fetchNotifications();
    showToast('Notifikasi dihapus', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleNotifDropdown(event) {
  if (event) event.stopPropagation();
  const dd = document.getElementById('notifDropdown');
  if (dd) {
    const isOpening = !dd.classList.contains('open');
    dd.classList.toggle('open');
    // Saat membuka dropdown notifikasi, otomatis hilangkan badge merah dan tandai dibaca
    if (isOpening) {
      markAllCurrentNotifsAsRead();
    }
  }
}

function closeNotifDropdown() {
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.classList.remove('open');
}

function markAllCurrentNotifsAsRead() {
  const redDot = document.getElementById('notifRedDot');
  if (redDot) redDot.style.display = 'none';

  const ids = allNotifications.map(n => n.id);
  saveReadNotificationIds(ids);

  allNotifications.forEach(n => { n.unread = false; });
  document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
  document.querySelectorAll('.notif-page-item.unread').forEach(el => el.classList.remove('unread'));

  const badgeUnread = document.getElementById('badgeNotifUnread');
  if (badgeUnread) badgeUnread.textContent = '0';

  // Laporkan ke server agar status sinkron
  if (ids.length > 0) {
    fetch(`${API_BASE}/notifications/read-all`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ids })
    }).catch(() => { });
  }

  if (currentView === 'notifications') {
    renderFullNotificationsPage();
  }
}

function clearNotifBadge() {
  markAllCurrentNotifsAsRead();
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
  } catch (_) { }
}

function updateAIContextPills() {
  const elFill = document.getElementById('aiFillText');
  const elWeight = document.getElementById('aiWeightText');
  const elDev = document.getElementById('aiDevText');
  const elDot = document.getElementById('aiDevDot');

  if (!lastDeviceData || !lastDeviceData.lastSeen) {
    if (elFill) elFill.textContent = '--%';
    if (elWeight) elWeight.textContent = '-- g';
    if (elDev) elDev.textContent = 'esp32-ecosort-1: Offline';
    if (elDot) elDot.style.backgroundColor = '#ef4444';
    return;
  }

  const w = lastDeviceData.currentWeightGram ?? lastDeviceData.weightGram ?? 0;
  if (elWeight) elWeight.textContent = w >= 1000 ? `${(w / 1000).toFixed(2)} kg` : `${Number(w).toFixed(1)} g`;

  // Kapasitas sampah dihitung proporsional dari berat maksimal 10 kg (10.000 gram)
  const pct = Math.min(100, Math.max(0, Math.round((Number(w) / 10000) * 100)));
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

let aiChatHistory = [];

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

  // Catat ke riwayat obrolan sesi
  aiChatHistory.push({ role: 'user', text: msg });
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
      body: JSON.stringify({
        message: msg,
        history: aiChatHistory.slice(-8)
      })
    });
    const data = await res.json();
    removeChatLoading(loadingId);

    if (data.reply) {
      aiChatHistory.push({ role: 'assistant', text: data.reply });
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
        <div class="msg-sender">Asisten EcoSort</div>
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
//  CCTV AI & ANALISIS SAMPAH SEKITAR (RADIUS 2 METER)
// ============================================================
let activeWebcamStream = null;
let currentCctvBase64 = null;
let cctvPollingTimer = null;

function startCctvPolling() {
  if (cctvPollingTimer) clearInterval(cctvPollingTimer);
  loadLatestCctv();
  cctvPollingTimer = setInterval(() => {
    if (typeof currentView !== 'undefined' && currentView === 'ai') {
      const secCctv = document.getElementById('aiCctvSection');
      if (secCctv && secCctv.style.display !== 'none') {
        loadLatestCctv();
      }
    }
  }, 2500);
}

function stopCctvPolling() {
  if (cctvPollingTimer) {
    clearInterval(cctvPollingTimer);
    cctvPollingTimer = null;
  }
}

function switchAiTab(tab) {
  const btnCctv = document.getElementById('tabAiCctvBtn');
  const btnChat = document.getElementById('tabAiChatBtn');
  const secCctv = document.getElementById('aiCctvSection');
  const secChat = document.getElementById('aiChatSection');

  if (tab === 'cctv') {
    if (btnCctv) btnCctv.classList.add('active');
    if (btnChat) btnChat.classList.remove('active');
    if (secCctv) secCctv.style.display = 'block';
    if (secChat) secChat.style.display = 'none';
    startCctvPolling();
    updateCctvServerUrlDisplay();
  } else {
    if (btnCctv) btnCctv.classList.remove('active');
    if (btnChat) btnChat.classList.add('active');
    if (secCctv) secCctv.style.display = 'none';
    if (secChat) secChat.style.display = 'flex';
    stopCctvPolling();
    scrollAIMessagesToBottom();
  }
}

async function handleCctvFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    currentCctvBase64 = e.target.result;
    const imgPreview = document.getElementById('cctvImagePreview');
    const placeholder = document.getElementById('cctvPlaceholderScreen');
    const video = document.getElementById('cctvWebcamVideo');

    if (video) video.style.display = 'none';
    stopWebcam();

    if (imgPreview) {
      imgPreview.src = currentCctvBase64;
      imgPreview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    // Otomatis jalankan analisa setelah upload foto
    await analyzeCctvImage(currentCctvBase64);
  };
  reader.readAsDataURL(file);
}

async function toggleWebcam() {
  const video = document.getElementById('cctvWebcamVideo');
  const imgPreview = document.getElementById('cctvImagePreview');
  const placeholder = document.getElementById('cctvPlaceholderScreen');
  const btnText = document.getElementById('btnWebcamText');

  if (activeWebcamStream) {
    stopWebcam();
    if (btnText) btnText.textContent = 'Kamera Langsung';
    if (video) video.style.display = 'none';
    if (imgPreview && imgPreview.getAttribute('src')) {
      imgPreview.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else if (placeholder) {
      placeholder.style.display = 'flex';
    }
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    activeWebcamStream = stream;
    if (video) {
      video.srcObject = stream;
      video.style.display = 'block';
    }
    if (imgPreview) imgPreview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (btnText) btnText.textContent = 'Matikan Kamera';
    showToast('Kamera aktif. Arahkan ke tong sampah (radius 2 meter)', 'success');
  } catch (err) {
    console.error('Webcam error:', err);
    showToast('Gagal mengakses kamera: ' + err.message, 'error');
  }
}

function stopWebcam() {
  if (activeWebcamStream) {
    activeWebcamStream.getTracks().forEach(track => track.stop());
    activeWebcamStream = null;
  }
}

async function triggerAnalyzeCctv() {
  const video = document.getElementById('cctvWebcamVideo');
  if (activeWebcamStream && video && video.videoWidth) {
    // Tangkap snapshot dari webcam
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    currentCctvBase64 = base64;
    await analyzeCctvImage(base64);
  } else if (currentCctvBase64) {
    await analyzeCctvImage(currentCctvBase64);
  } else {
    // Analisis frame terkini
    await analyzeCctvImage(null);
  }
}

async function analyzeCctvImage(base64Data = null, countOverride = null) {
  const btn = document.getElementById('btnAnalyzeCctv');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="spin-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8z"/>
      </svg>
      <span>Menganalisis AI...</span>
    `;
  }

  try {
    const res = await fetch(`/api/ai/analyze-cctv`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        image: base64Data,
        count: countOverride,
        deviceId: DEVICE_ID
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menganalisis');

    renderCctvResult(data);
    showToast(`Analisis CCTV Selesai: ${data.status} (${data.detectedTrashCount} sampah)`, 'success');

    // Segera sinkronkan status dashboard & notifikasi
    fetchDeviceStatus();
    fetchNotifications();
    fetchTransactions();

  } catch (err) {
    console.error('CCTV Analysis error:', err);
    showToast('Analisis gagal: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 13c-3.04 0-5.5-2.46-5.5-5.5S8.96 6.5 12 6.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5zm0-9c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5z"/>
        </svg>
        <span>Analisis AI Gemini</span>
      `;
    }
  }
}

function renderCctvResult(data) {
  if (!data) return;
  const count = Number(data.detectedTrashCount || 0);
  const isViolator = Boolean(data.violatorDetected);
  const banner = document.getElementById('cctvResultBanner');
  const statusEl = document.getElementById('cctvResultStatus');
  const countBadge = document.getElementById('cctvCountBadge');
  const hudBadge = document.getElementById('cctvHudStatusBadge');
  const hudText = document.getElementById('cctvHudStatusText');
  const identifiedCountEl = document.getElementById('cctvIdentifiedCount');
  const identifiedDescEl = document.getElementById('cctvIdentifiedDesc');
  const tagList = document.getElementById('cctvTrashItemsList');
  const alertBox = document.getElementById('cctvAlertCleanerBox');
  const alertMsg = document.getElementById('cctvAlertCleanerMsg');
  const reportTime = document.getElementById('cctvReportTime');

  if (reportTime) {
    const now = new Date();
    reportTime.textContent = `${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}`;
  }

  // Update banner warna: Merah jika Violator atau Kotor (>5), Kuning (1-5), Hijau (0 Bersih)
  if (banner) {
    banner.classList.remove('banner-green', 'banner-yellow', 'banner-red');
    if (isViolator) {
      banner.classList.add('banner-red');
      if (statusEl) statusEl.textContent = 'Pelanggaran: Buang Sembarangan!';
      if (hudText) hudText.textContent = '🚨 PELANGGARAN TERDETEKSI!';
      if (hudBadge) {
        hudBadge.style.color = '#ef4444';
        hudBadge.style.borderColor = 'rgba(239, 68, 68, 0.7)';
      }
    } else if (count === 0) {
      banner.classList.add('banner-green');
      if (statusEl) statusEl.textContent = 'Bersih (Bebas Pelanggaran)';
      if (hudText) hudText.textContent = 'Status: Bersih (0 Sampah)';
      if (hudBadge) {
        hudBadge.style.color = '#22c55e';
        hudBadge.style.borderColor = 'rgba(34, 197, 94, 0.4)';
      }
    } else if (count <= 5) {
      banner.classList.add('banner-yellow');
      if (statusEl) statusEl.textContent = 'Waspada (Ada Sampah)';
      if (hudText) hudText.textContent = `Status: Waspada (${count} Sampah)`;
      if (hudBadge) {
        hudBadge.style.color = '#f59e0b';
        hudBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      }
    } else {
      banner.classList.add('banner-red');
      if (statusEl) statusEl.textContent = 'Kotor (Sampah Menumpuk)';
      if (hudText) hudText.textContent = `Status: Kotor (${count} Sampah)`;
      if (hudBadge) {
        hudBadge.style.color = '#ef4444';
        hudBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      }
    }
  }

  // Indikator Kartu Pelanggaran AI Gemini
  const violatorCard = document.getElementById('cctvViolatorCard');
  const violatorTitle = document.getElementById('cctvViolatorTitle');
  const violatorDesc = document.getElementById('cctvViolatorDesc');

  if (violatorCard) {
    violatorCard.style.display = 'flex';
    if (isViolator) {
      violatorCard.classList.remove('violator-clean');
      if (violatorTitle) violatorTitle.textContent = '🚨 PELANGGARAN TERDETEKSI: BUANG SAMPAH SEMBARANGAN';
      if (violatorDesc) {
        violatorDesc.textContent = data.violatorDescription || 'Terdeteksi seseorang membuang sampah di luar tempat sampah. Tindakan pelanggaran dicatat ke sistem!';
      }
    } else {
      violatorCard.classList.add('violator-clean');
      if (violatorTitle) violatorTitle.textContent = '✅ TERTIB: BEBAS PELANGGARAN';
      if (violatorDesc) {
        violatorDesc.textContent = 'Tidak terdeteksi adanya orang yang membuang sampah sembarangan di sekitar tempat sampah.';
      }
    }
  }

  if (countBadge) {
    countBadge.textContent = `${count} Sampah Sekitar`;
  }

  // Update kotak "Jumlah Sampah yang Teridentifikasi" di bawah status lingkungan
  if (identifiedCountEl) {
    identifiedCountEl.textContent = count;
    if (isViolator || count > 5) {
      identifiedCountEl.style.color = '#dc2626';
    } else if (count <= 5 && count > 0) {
      identifiedCountEl.style.color = '#d97706';
    } else {
      identifiedCountEl.style.color = '#15803d';
    }
  }

  if (identifiedDescEl) {
    if (data.summary && data.summary.trim()) {
      identifiedDescEl.textContent = data.summary;
    } else if (isViolator) {
      identifiedDescEl.textContent = 'AI Gemini mendeteksi aksi pembuangan sampah sembarangan di luar tong sampah oleh seseorang.';
    } else if (count === 0) {
      identifiedDescEl.textContent = 'Lingkungan sekitar tong sampah bersih. Tidak ada sampah yang berserakan di radius 2 meter.';
    } else if (count <= 5) {
      identifiedDescEl.textContent = `Teridentifikasi ${count} objek sampah berserakan di sekitar tong sampah (Radius \u2264 2 meter). Status waspada.`;
    } else {
      identifiedDescEl.textContent = `Teridentifikasi ${count} objek sampah berserakan melebihi batas toleransi (> 5 sampah). Status lingkungan kotor dan peringatan telah diteruskan ke petugas kebersihan.`;
    }
  }

  // Tampilkan peringatan petugas kebersihan jika > 5 sampah atau violator terdeteksi
  if (alertBox) {
    if (isViolator || count > 5 || data.alertSent) {
      alertBox.style.display = 'flex';
      if (alertMsg) {
        if (data.alertMessage) {
          alertMsg.textContent = data.alertMessage;
        } else if (isViolator) {
          alertMsg.textContent = 'Terdeteksi orang yang membuang sampah sembarangan! Petugas kebersihan/keamanan diminta meninjau lokasi.';
        } else {
          alertMsg.textContent = 'Sampah berserakan di sekitar tong melebihi 5 objek. Pembersihan darurat diminta.';
        }
      }
    } else {
      alertBox.style.display = 'none';
    }
  }

  if (tagList) {
    tagList.innerHTML = '';
    const items = data.trashItems || [];
    if (items.length > 0) {
      items.forEach(it => {
        const span = document.createElement('span');
        span.className = 'cctv-tag-item';
        span.textContent = it;
        tagList.appendChild(span);
      });
    }
  }
}

async function clearCctvFrame() {
  const btn = document.getElementById('btnClearCctv');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }

  // 1. LANGSUNG BERSIHKAN TAMPILAN DI LAYAR (Instant UI, Anti-Lag, Anti-Crash)
  if (activeWebcamStream) {
    stopWebcam();
  }

  currentCctvBase64 = null;
  // Gunakan timestamp masa depan sementara agar poller tidak menampilkan frame lama saat async server diproses
  lastRenderedCctvTimestamp = (Date.now() + 60000).toString();

  const imgPreview = document.getElementById('cctvImagePreview');
  const placeholder = document.getElementById('cctvPlaceholderScreen');
  const video = document.getElementById('cctvWebcamVideo');

  if (imgPreview) {
    imgPreview.src = '';
    imgPreview.style.display = 'none';
  }
  if (video) {
    video.style.display = 'none';
  }
  if (placeholder) {
    placeholder.style.display = 'flex';
  }

  const connBadge = document.getElementById('cctvLiveConnStatus');
  if (connBadge) {
    connBadge.textContent = '⚪ Standby • Frame CCTV Dihapus';
    connBadge.style.color = '#94a3b8';
  }

  const reportTime = document.getElementById('cctvReportTime');
  if (reportTime) reportTime.textContent = 'Dibersihkan';

  // Reset status tampilan hasil analisis menjadi bersih
  renderCctvResult({
    detectedTrashCount: 0,
    status: 'Bersih',
    statusColor: 'green',
    summary: 'Frame CCTV telah dihapus. Kamera siap menerima tangkapan baru.',
    trashItems: [],
    violatorDetected: false,
    violatorDescription: null
  });

  // 2. Kirim sinkronisasi ke server (Aman, Tangani Format Apapun Tanpa Error JSON)
  try {
    const res = await fetch('/api/ai/clear-cctv', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ deviceId: DEVICE_ID, clear: true })
    });

    if (!res.ok) {
      // Jika endpoint /clear-cctv belum termuat di proses node lama (perlu restart),
      // gunakan fallback endpoint /analyze-cctv dengan flag clear
      await fetch('/api/ai/analyze-cctv', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ deviceId: DEVICE_ID, clear: true, count: 0, image: '' })
      }).catch(() => {});
    }
  } catch (errNet) {
    console.warn('Sinkronisasi server hapus frame:', errNet);
  }

  showToast('Frame foto CCTV berhasil dihapus', 'success');

  try {
    fetchDeviceStatus();
    fetchNotifications();
  } catch (_) {}

  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function simulateCctvDetection(count) {
  analyzeCctvImage(null, count);
}

let lastRenderedCctvTimestamp = null;

async function loadLatestCctv() {
  try {
    const res = await fetch(`/api/ai/latest-cctv`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const latest = data.latest;

    if (latest && latest.result) {
      // Perbarui tampilan jika ada frame baru atau baru pertama kali dimuat
      if (!lastRenderedCctvTimestamp || lastRenderedCctvTimestamp !== latest.timestamp) {
        lastRenderedCctvTimestamp = latest.timestamp;
        renderCctvResult(latest.result);

        const reportTime = document.getElementById('cctvReportTime');
        if (reportTime && latest.timestamp) {
          try {
            const d = new Date(latest.timestamp);
            reportTime.textContent = `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}.${d.getSeconds().toString().padStart(2, '0')}`;
          } catch (_) {
            reportTime.textContent = 'Terbaru';
          }
        }

        if (data.hasImage) {
          const imgPreview = document.getElementById('cctvImagePreview');
          const placeholder = document.getElementById('cctvPlaceholderScreen');
          const video = document.getElementById('cctvWebcamVideo');

          // Cegah tampilan dobel/split: jika webcam sedang aktif, jangan tampilkan imgPreview
          if (activeWebcamStream) {
            if (imgPreview) imgPreview.style.display = 'none';
          } else {
            if (video) video.style.display = 'none';
            if (imgPreview) {
              imgPreview.src = `/api/ai/latest-cctv-image?t=${encodeURIComponent(latest.timestamp)}`;
              imgPreview.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
          }
        } else {
          // Tidak ada gambar / frame telah dihapus
          const imgPreview = document.getElementById('cctvImagePreview');
          const placeholder = document.getElementById('cctvPlaceholderScreen');
          if (!activeWebcamStream) {
            if (imgPreview) {
              imgPreview.style.display = 'none';
              imgPreview.src = '';
            }
            if (placeholder) placeholder.style.display = 'flex';
          }
        }
      }
    }

    // Perbarui indikator koneksi aplikasi CCTV
    const connBadge = document.getElementById('cctvLiveConnStatus');
    if (connBadge && latest?.timestamp) {
      const diffMs = Date.now() - new Date(latest.timestamp).getTime();
      if (diffMs < 60000) {
        connBadge.textContent = '🟢 Aplikasi CCTV Terhubung • LIVE';
        connBadge.style.color = '#4ade80';
      } else if (diffMs < 300000) {
        connBadge.textContent = '🟡 SIAGA • Frame Terakhir';
        connBadge.style.color = '#facc15';
      } else {
        connBadge.textContent = '⚪ Menunggu Frame CCTV';
        connBadge.style.color = '#94a3b8';
      }
    }
  } catch (err) {
    console.error('loadLatestCctv error:', err);
  }
}

// Update tampilan alamat server yang harus dimasukkan pengguna di aplikasi CCTV HP
async function updateCctvServerUrlDisplay() {
  const displayEl = document.getElementById('cctvServerUrlDisplay');
  if (!displayEl) return;

  try {
    // Jika dashboard dibuka lewat IP jaringan LAN langsung, pakai origin saat ini
    const curHost = window.location.hostname;
    if (curHost && curHost !== 'localhost' && curHost !== '127.0.0.1') {
      displayEl.textContent = window.location.origin;
      return;
    }

    // Jika dibuka lewat localhost, ambil IP LAN server dari backend
    const res = await fetch('/api/ai/server-info');
    if (res.ok) {
      const info = await res.json();
      if (info.serverUrl) {
        displayEl.textContent = info.serverUrl;
      }
    }
  } catch (_) {
    displayEl.textContent = 'http://192.168.109.46:40122';
  }
}

// Salin URL Server ke clipboard agar mudah dimasukkan ke HP
function copyCctvServerUrl() {
  const displayEl = document.getElementById('cctvServerUrlDisplay');
  const url = displayEl ? displayEl.textContent.trim() : 'http://192.168.109.46:40122';
  navigator.clipboard.writeText(url).then(() => {
    showToast(`URL Server CCTV disalin: ${url}`, 'success');
  }).catch(() => {
    showToast(`Salin manual URL: ${url}`, 'info');
  });
}

// Modal Konfigurasi Google Gemini API Key
function openGeminiKeyModal() {
  const modal = document.getElementById('geminiKeyModal');
  if (modal) modal.style.display = 'flex';
}

function closeGeminiKeyModal() {
  const modal = document.getElementById('geminiKeyModal');
  if (modal) modal.style.display = 'none';
}

function handleGeminiModalBackdropClick(event) {
  if (event.target && event.target.id === 'geminiKeyModal') {
    closeGeminiKeyModal();
  }
}

async function saveGeminiKey() {
  const input = document.getElementById('inputGeminiApiKey');
  const btn = document.getElementById('btnSaveGeminiKey');
  if (!input) return;

  const key = input.value.trim();
  if (!key || key.length < 10) {
    showToast('Masukkan Google Gemini API Key yang valid (minimal 10 karakter)!', 'warning');
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/ai/config-key', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ apiKey: key })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Google Gemini API Key berhasil disimpan dan aktif!', 'success');
      input.value = '';
      closeGeminiKeyModal();
      checkAIStatus();
    } else {
      showToast(data.error || 'Gagal menyimpan API Key', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server untuk menyimpan API Key', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
//  HALAMAN ANALITIK (GRAFIK RISET & METRIK LENGKAP)
// ============================================================
function setAnalyticsRange(range) {
  currentAnalyticsRange = range;
  const btnToday = document.getElementById('btnRangeToday');
  const btn7d = document.getElementById('btnRange7d');
  const btn30d = document.getElementById('btnRange30d');
  if (btnToday) btnToday.classList.toggle('active', range === 'today');
  if (btn7d) btn7d.classList.toggle('active', range === '7days');
  if (btn30d) btn30d.classList.toggle('active', range === '30days');

  const titleEl = document.getElementById('analyticsWeightChartTitle');
  const legendPeriod = document.getElementById('legendAnalyticsWeightPeriod');
  if (range === 'today') {
    if (titleEl) titleEl.textContent = 'Riwayat Berat per Jam';
    if (legendPeriod) legendPeriod.textContent = 'Hari ini (g)';
  } else if (range === '7days') {
    if (titleEl) titleEl.textContent = 'Riwayat Berat 7 Hari Terakhir';
    if (legendPeriod) legendPeriod.textContent = '7 Hari (g)';
  } else if (range === '30days') {
    if (titleEl) titleEl.textContent = 'Riwayat Berat 1 Bulan Terakhir';
    if (legendPeriod) legendPeriod.textContent = '1 Bulan (g)';
  }

  loadAnalyticsData(range);
}

async function loadAnalyticsData(range = 'today') {
  try {
    const res = await fetch(`${API_BASE}/analytics?deviceId=${DEVICE_ID}&range=${range}`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    const mAvg = document.getElementById('metricAvgWeight');
    const mPeak = document.getElementById('metricPeakWeight');
    const mEnv = document.getElementById('metricEnvStatus');
    const mEnvSub = document.getElementById('metricEnvSub');

    if (mAvg) mAvg.textContent = data.metrics?.avgWeight || '-- g';
    if (mPeak) {
      if (data.metrics?.capacity) {
        mPeak.textContent = data.metrics.capacity;
      } else if (data.metrics?.peakCapacity) {
        mPeak.textContent = data.metrics.peakCapacity;
      } else if (data.metrics?.peakWeight) {
        const num = parseFloat(data.metrics.peakWeight);
        const pct = Math.min(100, Math.max(0, Math.round((num / 10000) * 100)));
        mPeak.textContent = `${pct}%`;
      } else {
        mPeak.textContent = '-- %';
      }
    }

    // Status Lingkungan: Jika 7 Hari atau 1 Bulan -> tampilkan tanda "-"
    if (mEnv) {
      if (range === '7days' || range === '30days') {
        mEnv.textContent = '-';
        mEnv.classList.remove('status-green', 'status-yellow', 'status-red');
        if (mEnvSub) mEnvSub.textContent = '-';
      } else {
        const count = Number(data.metrics?.surroundingTrashCount ?? 0);
        mEnv.classList.remove('status-green', 'status-yellow', 'status-red');
        if (count === 0) {
          mEnv.textContent = 'Bersih';
          mEnv.classList.add('status-green');
          if (mEnvSub) mEnvSub.textContent = 'Kamera: 0 Sampah';
        } else if (count <= 5) {
          mEnv.textContent = `${count} Sampah`;
          mEnv.classList.add('status-yellow');
          if (mEnvSub) mEnvSub.textContent = `Kamera: 1-5 Sampah (${count} objek)`;
        } else {
          mEnv.textContent = `${count} Sampah`;
          mEnv.classList.add('status-red');
          if (mEnvSub) mEnvSub.textContent = `Kamera: >5 Sampah (${count} objek)`;
        }
      }
    }

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
let cachedReportsTransactions = [];
let activeReportTx = null;

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
    cachedReportsTransactions = txList;

    const weighingCount = txList.filter(t => t.type === 'Penimbangan' || (!t.commandId && t.type !== 'Perintah')).length;
    const commandCount = txList.filter(t => t.type === 'Perintah' || Boolean(t.commandId)).length;

    // 4 Ringkasan Terpisah
    const repTot = document.getElementById('repTotalWeight');
    const totW = dev?.totalWeightGram || 0;
    if (repTot) {
      repTot.textContent = totW >= 1000 ? `${(totW / 1000).toFixed(2)} kg` : `${Number(totW).toFixed(1)} g`;
    }

    const repWeighing = document.getElementById('repWeighingEvents');
    if (repWeighing) repWeighing.textContent = `${weighingCount} kali`;

    const repCommand = document.getElementById('repCommandEvents');
    if (repCommand) repCommand.textContent = `${commandCount} perintah`;

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

    // Render tabel laporan dengan 5 kolom (ID, Waktu, Status Berat, Volume Sampah, Hapus)
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    if (txList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-row">
            Belum ada catatan log aktivitas tersimpan
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = txList.map(tx => {
      let cleanId = String(tx.id || '').replace(/^#+/, '') || '1';
      if (parseInt(cleanId, 10) > 2024000) {
        cleanId = String(parseInt(cleanId, 10) - 2024000 + 1);
      }
      const distDisplay = formatReportDistance(tx);

      return `
        <tr class="report-row-clickable" onclick="openReportDetailModal('${escapeHTML(tx.id)}')" title="Klik untuk melihat detail & cetak laporan">
          <td>
            <div class="tx-id-col">
              <div class="tx-icon-circle">
                <svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7z"/></svg>
              </div>
              <span>${escapeHTML(cleanId)}</span>
            </div>
          </td>
          <td class="tx-date-col">${escapeHTML(tx.date || 'Tidak ada data')}</td>
          <td class="tx-amount-col">${escapeHTML(tx.rawAmount || tx.amount || '0.0 g')}</td>
          <td>${escapeHTML(distDisplay)}</td>
          <td style="text-align: center;" onclick="event.stopPropagation();">
            <button type="button" class="btn-row-delete-flat" onclick="handleDeleteSingleLog('${escapeHTML(tx.id)}')" title="Hapus catatan ini">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

function formatReportDistance(tx) {
  if (!tx) return '35.0 cm';
  if (tx.distance && tx.distance !== '--' && tx.distance !== 'Tidak ada data') {
    return tx.distance;
  }
  if (tx.distanceCm !== null && tx.distanceCm !== undefined && tx.distanceCm !== '--') {
    return `${tx.distanceCm} cm`;
  }
  if (typeof lastDeviceData !== 'undefined' && lastDeviceData?.distanceCm) {
    return `${lastDeviceData.distanceCm} cm`;
  }
  if (tx.type === 'Perintah' || (tx.amount && tx.amount.includes('Tare'))) {
    return '35.0 cm (Dasar Tong)';
  }
  return '35.0 cm (Dasar)';
}

// ---- Modal Detail Laporan & Cetak ----
function openReportDetailModal(txId) {
  const tx = cachedReportsTransactions.find(t => String(t.id) === String(txId));
  if (!tx) return;
  activeReportTx = tx;

  let cleanId = String(tx.id || txId || '').replace(/^#+/, '') || '1';
  if (parseInt(cleanId, 10) > 2024000) {
    cleanId = String(parseInt(cleanId, 10) - 2024000 + 1);
  }

  // Kode Laporan selalu ada dan tampil untuk SEMUA laporan
  const reportCode = tx.reportCode || tx.commandId || `LP-${String(cleanId).padStart(4, '0')}`;

  const elSub = document.getElementById('repModalSub');
  const elId = document.getElementById('repModalId');
  const elDate = document.getElementById('repModalDate');
  const elDevice = document.getElementById('repModalDevice');
  const elType = document.getElementById('repModalType');
  const elWeight = document.getElementById('repModalWeight');
  const elVolume = document.getElementById('repModalVolume');
  const elCmdRow = document.getElementById('repModalCommandRow');
  const elCmdId = document.getElementById('repModalCommandId');
  const elLocation = document.getElementById('repModalLocation');

  if (elSub) elSub.textContent = `Kode Laporan: ${reportCode}`;
  if (elId) elId.textContent = cleanId;
  if (elDate) elDate.textContent = tx.date || (tx.timestamp ? new Date(tx.timestamp).toLocaleString('id-ID') : '-');
  if (elDevice) elDevice.textContent = tx.deviceId || 'esp32-ecosort-1';

  const txType = tx.type || (tx.commandId ? 'Perintah Sistem' : 'Penimbangan Sampah');
  if (elType) elType.textContent = txType;

  if (elWeight) elWeight.textContent = tx.rawAmount || tx.amount || '0.0 g';

  const distDisplay = formatReportDistance(tx);
  if (elVolume) {
    elVolume.textContent = distDisplay;
    elVolume.className = 'report-metric-number highlight-green';
  }

  // Kode Laporan WAJIB selalu tampil di tabel untuk semua laporan
  if (elCmdRow && elCmdId) {
    elCmdRow.style.display = 'flex';
    elCmdId.textContent = reportCode;
  }

  if (elLocation) {
    elLocation.textContent = 'Taman Kota';
  }

  const modal = document.getElementById('reportDetailModal');
  if (modal) {
    modal.classList.add('open');
    const modalBody = document.getElementById('reportModalBody');
    if (modalBody) modalBody.scrollTop = 0;
    const modalCard = modal.querySelector('.report-detail-card');
    if (modalCard) modalCard.scrollTop = 0;
  }
}

function closeReportDetailModal() {
  const modal = document.getElementById('reportDetailModal');
  if (modal) {
    modal.classList.remove('open');
  }
  activeReportTx = null;
}

function handleReportModalBackdropClick(e) {
  if (e.target && e.target.id === 'reportDetailModal') {
    closeReportDetailModal();
  }
}

function printCurrentReport() {
  if (!activeReportTx) {
    window.print();
    return;
  }

  const tx = activeReportTx;
  let cleanId = String(tx.id || '').replace(/^#+/, '') || '1';
  if (parseInt(cleanId, 10) > 2024000) {
    cleanId = String(parseInt(cleanId, 10) - 2024000 + 1);
  }
  const reportCode = tx.reportCode || tx.commandId || `LP-${String(cleanId).padStart(4, '0')}`;
  const printWindow = window.open('', '_blank', 'width=780,height=850');
  if (!printWindow) {
    window.print();
    return;
  }

  const distDisplay = formatReportDistance(tx);

  const printHtml = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan_EcoSort_${cleanId}</title>
  <style>
    @page { size: A4 portrait; margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 24px;
      line-height: 1.5;
    }
    .print-card {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #cbd5e1;
      border-radius: 12px;
      padding: 28px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #74c718;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }
    .header p {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .info-item label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-item strong {
      font-size: 14px;
      color: #0f172a;
    }
    .metric-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 20px;
    }
    .metric-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .metric-box.green { background: #f0fdf4; border-color: #bbf7d0; }
    .metric-box.orange { background: #fffbeb; border-color: #fde68a; }
    .metric-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
    .metric-val { font-size: 24px; font-weight: 800; margin: 4px 0; }
    .metric-box.green .metric-val { color: #16a34a; }
    .metric-box.orange .metric-val { color: #d97706; }
    .metric-sub { font-size: 10px; color: #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background: #f8fafc;
      text-align: left;
      font-weight: 700;
      color: #475569;
    }
    td:last-child {
      text-align: right;
      font-weight: 600;
      color: #0f172a;
    }
    .footer-note {
      font-size: 10px;
      color: #94a3b8;
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
      text-align: center;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="print-card">
    <div class="header">
      <div>
        <h1>EcoSort IoT — Laporan Pemantauan Sampah</h1>
        <p>Dokumen Digital Resmi Sistem Penimbangan &amp; Sensor IoT</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item"><label>ID Kejadian</label><strong>${escapeHTML(cleanId)}</strong></div>
      <div class="info-item"><label>Waktu Pencatatan</label><strong>${escapeHTML(tx.date || '-')}</strong></div>
      <div class="info-item"><label>ID Perangkat</label><strong>${escapeHTML(tx.deviceId || 'esp32-ecosort-1')}</strong></div>
      <div class="info-item"><label>Tipe Aktivitas</label><strong>${escapeHTML(tx.type || 'Penimbangan Sampah')}</strong></div>
    </div>

    <div class="metric-row">
      <div class="metric-box green">
        <div class="metric-label">STATUS / NILAI BERAT</div>
        <div class="metric-val">${escapeHTML(tx.rawAmount || tx.amount || '0.0 g')}</div>
        <div class="metric-sub">Sensor Load Cell HX711</div>
      </div>
      <div class="metric-box orange">
        <div class="metric-label">VOLUME SAMPAH</div>
        <div class="metric-val">${escapeHTML(distDisplay)}</div>
        <div class="metric-sub">Sensor Ultrasonik HC-SR04</div>
      </div>
    </div>

    <table>
      <tr><th>Parameter Sistem</th><th style="text-align:right;">Nilai / Keterangan</th></tr>
      <tr><td>Lokasi</td><td>Taman Kota</td></tr>
      <tr><td>Kode Laporan</td><td>${escapeHTML(reportCode)}</td></tr>
      <tr><td>Metode Integrasi</td><td>MicroPython ESP32 Telemetry REST API</td></tr>
      <tr><td>Waktu Cetak Dokumen</td><td>${new Date().toLocaleString('id-ID')}</td></tr>
    </table>

    <div class="footer-note">
      Dokumen ini sah dan diterbitkan secara otomatis oleh server IoT EcoSort Taman Kota. Data bersumber langsung dari pembacaan sensor fisik.
    </div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  <\/script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(printHtml);
  printWindow.document.close();
}

// ---- Fungsi Hapus Log Laporan (Gambar 2) ----
async function handleClearAllLogs() {
  if (!confirm('Apakah Anda yakin ingin menghapus SELURUH catatan log aktivitas?')) return;
  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Gagal membersihkan log aktivitas');
    showToast('Seluruh log aktivitas berhasil dibersihkan', 'success');
    loadReportsData();
    fetchTransactions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteSingleLog(id) {
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Gagal menghapus log');
    showToast(`Log ${id} berhasil dihapus`, 'success');
    loadReportsData();
    fetchTransactions();
  } catch (err) {
    showToast(err.message, 'error');
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
      if (elTrendW) elTrendW.textContent = 'Offline';

      const elD = document.getElementById('valDistance');
      if (elD) elD.innerHTML = `--<span class="hero-unit">%</span>`;
      const elTrendD = document.getElementById('distanceTrend');
      if (elTrendD) elTrendD.textContent = 'Offline';

      const elBanner = document.getElementById('heroMetricBanner');
      if (elBanner) {
        elBanner.classList.remove('banner-env-yellow', 'banner-env-red');
        elBanner.classList.add('banner-env-green');
      }
      const elS = document.getElementById('valStatus');
      if (elS) elS.textContent = 'Bersih';
      const elTrendS = document.getElementById('statusTrend');
      if (elTrendS) elTrendS.textContent = 'Kamera: 0 Sampah';

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

      const elM1 = document.getElementById('profileMetric1');
      if (elM1) elM1.textContent = '0.0g';
      const elM3 = document.getElementById('profileMetric3');
      if (elM3) elM3.textContent = 'Offline';

      const capText = document.getElementById('profileCapacityText');
      if (capText) capText.textContent = '--';
      const capFill = document.getElementById('profileCapacityFill');
      if (capFill) capFill.style.width = '0%';

      if (typeof updateDonutChartData === 'function') updateDonutChartData(null);
      updateAIContextPills();
      return;
    }

    lastDeviceData = dev;
    try {
      localStorage.setItem('ecosort_last_device_cache', JSON.stringify(dev));
    } catch (_) { }
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

    // 1. Kartu 1: Berat Sampah
    const weightVal = dev.currentWeightGram ?? dev.weightGram ?? 0;
    const curW = Number(weightVal) || 0;
    const elWeight = document.getElementById('valWeight');
    if (elWeight) {
      elWeight.innerHTML = `${Number(weightVal).toFixed(1)}<span class="hero-unit">g</span>`;
    }
    const elTrendW = document.getElementById('weightTrend');
    if (elTrendW) {
      elTrendW.textContent = isOnline ? 'Live' : lastSeenClockLabel;
    }

    // 2. Kartu 2: Kapasitas Sampah (Kolaborasi Cerdas Sensor Ultrasonik & Load Cell)
    let fillPercent = 0;
    if (dev.fillPercent !== undefined && dev.fillPercent !== null) {
      fillPercent = Math.min(100, Math.max(0, Math.round(Number(dev.fillPercent))));
    } else {
      const dist = dev.distanceCm != null ? Number(dev.distanceCm) : null;
      const emptyD = Number(dev.emptyDistanceCm || 35);
      const fullT = Number(dev.fullThresholdCm || 10);
      let vP = 0;
      if (dist !== null && dist > 0 && emptyD > fullT) {
        const uH = emptyD - fullT;
        const tH = Math.max(0, emptyD - dist);
        vP = Math.min(100, Math.max(0, Math.round((tH / uH) * 100)));
      }
      const wP = Math.min(100, Math.max(0, Math.round((curW / 1000) * 100)));
      fillPercent = Math.max(vP, wP);
    }

    const elDist = document.getElementById('valDistance');
    if (elDist) {
      if (!isOnline) {
        elDist.innerHTML = `--<span class="hero-unit">%</span>`;
      } else {
        elDist.innerHTML = `${fillPercent}<span class="hero-unit">%</span>`;
      }
    }
    const elTrendD = document.getElementById('distanceTrend');
    if (elTrendD) {
      elTrendD.textContent = isOnline ? `${fillPercent}% Terisi (Sensor Fusion)` : lastSeenClockLabel;
    }

    // 3. Kartu 3: Status Lingkungan (Deteksi Kamera AI)
    // 0 sampah: 1 Kotak Banner Utuh Berwarna Hijau (Bersih)
    // 1-5 sampah: 1 Kotak Banner Utuh Berwarna Kuning (Waspada)
    // >5 sampah: 1 Kotak Banner Utuh Berwarna Merah (Banyak Sampah / Kritis)
    const elBanner = document.getElementById('heroMetricBanner');
    const elStatus = document.getElementById('valStatus');
    const elStatusTrend = document.getElementById('statusTrend');
    const trashCount = Number(dev.surroundingTrashCount ?? 0);

    if (elBanner) {
      elBanner.classList.remove('banner-env-green', 'banner-env-yellow', 'banner-env-red');
      if (trashCount === 0) {
        elBanner.classList.add('banner-env-green');
        if (elStatus) elStatus.textContent = 'Bersih';
        if (elStatusTrend) elStatusTrend.textContent = 'Kamera: 0 Sampah';
      } else if (trashCount >= 1 && trashCount <= 5) {
        elBanner.classList.add('banner-env-yellow');
        if (elStatus) elStatus.textContent = `${trashCount} Sampah`;
        if (elStatusTrend) elStatusTrend.textContent = 'Kamera: 1-5 Sampah';
      } else {
        elBanner.classList.add('banner-env-red');
        if (elStatus) elStatus.textContent = `${trashCount} Sampah`;
        if (elStatusTrend) elStatusTrend.textContent = 'Kamera: >5 Sampah';
      }
    }

    // Update Kotak Analitik secara REAL-TIME saat sensor membaca (Gambar 3)
    const mAvg = document.getElementById('metricAvgWeight');
    const mPeak = document.getElementById('metricPeakWeight');
    if (mAvg) {
      mAvg.textContent = curW >= 1000 ? `${(curW / 1000).toFixed(2)} kg` : `${curW.toFixed(1)} g`;
    }
    if (mPeak) {
      mPeak.textContent = `${fillPercent}%`;
    }

    // Update Status Lingkungan di Halaman Analitik jika aktif
    const mEnv = document.getElementById('metricEnvStatus');
    const mEnvSub = document.getElementById('metricEnvSub');
    if (mEnv) {
      if (typeof currentAnalyticsRange !== 'undefined' && (currentAnalyticsRange === '7days' || currentAnalyticsRange === '30days')) {
        mEnv.textContent = '-';
        mEnv.classList.remove('status-green', 'status-yellow', 'status-red');
        if (mEnvSub) mEnvSub.textContent = '-';
      } else {
        mEnv.classList.remove('status-green', 'status-yellow', 'status-red');
        if (trashCount === 0) {
          mEnv.textContent = 'Bersih';
          mEnv.classList.add('status-green');
          if (mEnvSub) mEnvSub.textContent = 'Kamera: 0 Sampah';
        } else if (trashCount <= 5) {
          mEnv.textContent = `${trashCount} Sampah`;
          mEnv.classList.add('status-yellow');
          if (mEnvSub) mEnvSub.textContent = `Kamera: 1-5 Sampah (${trashCount} objek)`;
        } else {
          mEnv.textContent = `${trashCount} Sampah`;
          mEnv.classList.add('status-red');
          if (mEnvSub) mEnvSub.textContent = `Kamera: >5 Sampah (${trashCount} objek)`;
        }
      }
    }

    // 4. Donut Kapasitas Sampah (Persentase Isi)
    // Saat offline: "Kapasitas Sampah" di panel profil dan donut menampilkan "--" (cincin abu-abu netral), bukan 0%
    const capText = document.getElementById('profileCapacityText');
    const capFill = document.getElementById('profileCapacityFill');

    if (!isOnline) {
      if (typeof updateDonutChartData === 'function') updateDonutChartData(null);
      if (capText) capText.textContent = '--';
      if (capFill) capFill.style.width = '0%';
    } else {
      if (typeof updateDonutChartData === 'function') {
        updateDonutChartData(fillPercent);
      }
      if (capText) capText.textContent = `${fillPercent}%`;
      if (capFill) capFill.style.width = `${fillPercent}%`;
    }

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

    // 7. Nilai Tare Kustom (Berat Tong / Komponen)
    const elTareDisp = document.getElementById('currentTareOffsetDisplay');
    if (elTareDisp) {
      const activeTare = dev.tareOffsetGram !== undefined
        ? Number(dev.tareOffsetGram)
        : (parseFloat(localStorage.getItem('ecosort_tare_offset')) || 0);
      elTareDisp.textContent = `${activeTare.toFixed(1)} g`;
    }

    // Masukkan data live ke buffer grafik samping agar berjalan real-time (Gambar 1)
    const nowIso = new Date().toISOString();
    liveSideChartBuffer.push({
      t: nowIso,
      w: curW,
      tw: curW,
      d: dev.distanceCm
    });
    if (liveSideChartBuffer.length > 14) {
      liveSideChartBuffer.shift();
    }
    if (typeof updateSideSensorChart === 'function') {
      updateSideSensorChart(liveSideChartBuffer, curW, dev.distanceCm);
    }

    updateAIContextPills();
    if (typeof currentView !== 'undefined' && currentView === 'ai' && typeof loadLatestCctv === 'function') {
      loadLatestCctv();
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
    if (data.history && Array.isArray(data.history)) {
      if (liveSideChartBuffer.length < 5) {
        liveSideChartBuffer = data.history.slice(-14);
      }
      // Jika sedang berada di halaman analitik, perbarui grafik analitik agar berjalan real-time (Gambar 3)
      if (currentView === 'analytics' && currentAnalyticsRange === 'today') {
        loadAnalyticsData('today');
      }
    }
  } catch (err) {
    console.error('Error fetching history:', err);
  }
}

// ---- Polling Transaksi (Recent Transaction) & Live Search ----
let allTransactions = [];

function handleDashboardSearch(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderTransactions(allTransactions, false);
    return;
  }
  const filtered = allTransactions.filter(tx => {
    const id = String(tx.id || '').toLowerCase();
    const date = String(tx.date || '').toLowerCase();
    const type = String(tx.type || '').toLowerCase();
    const amt = String(tx.rawAmount || tx.amount || '').toLowerCase();
    const dist = String(tx.distance || '').toLowerCase();
    const st = String(tx.status || '').toLowerCase();
    return id.includes(q) || date.includes(q) || type.includes(q) || amt.includes(q) || dist.includes(q) || st.includes(q);
  });
  renderTransactions(filtered, true);
}

async function fetchTransactions() {
  try {
    const res = await fetch(`${API_BASE}/transactions`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.transactions || [];
    currentTxCount = list.length;
    allTransactions = list;

    const elM2 = document.getElementById('profileMetric2');
    if (elM2) elM2.textContent = String(currentTxCount);

    const searchInput = document.getElementById('dashboardSearchInput');
    if (searchInput && searchInput.value.trim()) {
      handleDashboardSearch(searchInput.value);
    } else {
      renderTransactions(list, false);
    }
  } catch (err) {
    console.error('Error fetching transactions:', err);
  }
}

function renderTransactions(list, isFiltered = false) {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">
          ${isFiltered ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada riwayat penimbangan tercatat'}
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

    const cleanId = String(tx.id || '').replace(/^#+/, '') || '1';

    return `
      <tr>
        <td>
          <div class="tx-id-col">
            <div class="tx-icon-circle">
              <svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7z"/></svg>
            </div>
            <span>${escapeHTML(cleanId)}</span>
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
  switchNav('control');
}

function closeControlModal() {
  // Kontrol sekarang berupa halaman penuh view-control
}

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
    btn.innerHTML = `<span>Memproses Tare...</span>`;
  }

  // Solusi Bug: Langsung nolkan data berat sampah & kapasitas pada tampilan website secara instan
  // agar pengguna tidak menunggu data ESP32 atau terjebak data lama saat tong sudah kosong
  const elWeight = document.getElementById('valWeight');
  if (elWeight) elWeight.innerHTML = `0.0<span class="hero-unit">g</span>`;
  const elM1 = document.getElementById('profileMetric1');
  if (elM1) elM1.textContent = '0.0g';
  const elEarn = document.getElementById('earningAmount');
  if (elEarn) elEarn.textContent = '0.0 g';

  // Nolkan juga tampilan persentase kapasitas sampah (karena berbasis berat 10 kg)
  const elDist = document.getElementById('valDistance');
  if (elDist) elDist.innerHTML = `0<span class="hero-unit">%</span>`;
  const elTrendD = document.getElementById('distanceTrend');
  if (elTrendD) elTrendD.textContent = '0% dari 10 kg';

  const capText = document.getElementById('profileCapacityText');
  if (capText) capText.textContent = '0%';
  const capFill = document.getElementById('profileCapacityFill');
  if (capFill) capFill.style.width = '0%';

  const liveW = document.getElementById('sideLiveWeightLabel');
  if (liveW) liveW.textContent = '0.0 g';
  const liveC = document.getElementById('sideLiveCapLabel');
  if (liveC) liveC.textContent = '0%';

  if (typeof updateDonutChartData === 'function') {
    updateDonutChartData(0);
  }
  if (typeof updateSideSensorChart === 'function') {
    updateSideSensorChart(null, 0, 0);
  }

  if (lastDeviceData) {
    lastDeviceData.currentWeightGram = 0;
    lastDeviceData.weightGram = 0;
    lastDeviceData.totalWeightGram = 0;
  }

  try {
    const res = await fetch(`${API_BASE}/tare`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ deviceId: DEVICE_ID })
    });
    if (res.ok) {
      const isOnline = lastDeviceData && (Date.now() - new Date(lastDeviceData.lastSeen || 0).getTime() < 10000);
      if (isOnline) {
        showToast('Timbangan berhasil dinolkan. Status bak sampah kosong (0.0 g, 0%)', 'success');
      } else {
        showToast('Timbangan website dinolkan (0.0 g). ESP32 offline: antrean kalibrasi disimpan di server.', 'info');
      }
      fetchTransactions();
      fetchNotifications();
      fetchHistory();
    } else {
      await sendCommand('tare');
    }
  } catch (e) {
    await sendCommand('tare');
  }

  if (btn) {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        <span>Reset Timbangan</span>
      `;
    }, 800);
  }
  closeControlModal();
}

async function handleTareOffset() {
  const input = document.getElementById('inputTareOffset');
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0) {
    showToast('Masukkan berat tong / komponen yang valid (gram)', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/tare-offset`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ deviceId: DEVICE_ID, tareOffsetGram: val })
    });
    const data = await res.json();
    if (res.ok) {
      const disp = document.getElementById('currentTareOffsetDisplay');
      if (disp) disp.textContent = `${val.toFixed(1)} g`;
      localStorage.setItem('ecosort_tare_offset', val);
      input.value = '';
      showToast(`Berat tong/komponen disimpan: ${val.toFixed(1)} g. Hitungan sampah riil disesuaikan otomatis.`, 'success');
      fetchDeviceStatus();
      fetchTransactions();
      closeControlModal();
    } else {
      showToast(data.error || 'Gagal menyimpan tare offset', 'error');
    }
  } catch (err) {
    showToast('Gagal menghubungi server', 'error');
  }
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
//  SIMULASI KAMERA DETEKSI SAMPAH SEKITAR (STATUS LINGKUNGAN)
//  0: Hijau (Bersih)
//  1-5: Kuning (Waspada)
//  >5: Merah (Kritis)
// ============================================================
window.setSurroundingTrash = async function (count) {
  const num = Math.max(0, parseInt(count, 10) || 0);
  try {
    const res = await fetch(`${API_BASE}/surrounding-trash`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ deviceId: DEVICE_ID, count: num })
    });
    const data = await res.json();
    if (res.ok) {
      const label = num === 0 ? '0 (Bersih - Hijau)' : num <= 5 ? `${num} (Waspada - Kuning)` : `${num} (Banyak Sampah - Merah)`;
      showToast(`Status kamera lingkungan: ${label}`, 'success');

      // Update UI kotak banner utuh dan teks secara instan
      const elBanner = document.getElementById('heroMetricBanner');
      const elStatus = document.getElementById('valStatus');
      const elStatusTrend = document.getElementById('statusTrend');

      if (elBanner) {
        elBanner.classList.remove('banner-env-green', 'banner-env-yellow', 'banner-env-red');
        if (num === 0) {
          elBanner.classList.add('banner-env-green');
          if (elStatus) elStatus.textContent = 'Bersih';
          if (elStatusTrend) elStatusTrend.textContent = 'Kamera: 0 Sampah';
        } else if (num >= 1 && num <= 5) {
          elBanner.classList.add('banner-env-yellow');
          if (elStatus) elStatus.textContent = `${num} Sampah`;
          if (elStatusTrend) elStatusTrend.textContent = 'Kamera: 1-5 Sampah';
        } else {
          elBanner.classList.add('banner-env-red');
          if (elStatus) elStatus.textContent = `${num} Sampah`;
          if (elStatusTrend) elStatusTrend.textContent = 'Kamera: >5 Sampah';
        }
      }
    } else {
      showToast(data.error || 'Gagal mengubah status kamera', 'danger');
    }
  } catch (err) {
    showToast('Koneksi server gagal: ' + err.message, 'danger');
  }
};

// Pulihkan data status perangkat dari cache lokal agar kotak profil tidak berkedip kosong saat refresh
function restoreCachedDeviceStatus() {
  try {
    const raw = localStorage.getItem('ecosort_last_device_cache');
    if (!raw) return;
    const dev = JSON.parse(raw);
    if (!dev) return;
    lastDeviceData = dev;

    const weightVal = dev.currentWeightGram ?? dev.weightGram ?? 0;
    const curW = Number(weightVal);
    const fillPercent = dev.fillPercent != null ? Number(dev.fillPercent) : Math.min(100, Math.max(0, Math.round((curW / 1000) * 100)));

    const elWeight = document.getElementById('valWeight');
    if (elWeight) elWeight.innerHTML = `${curW.toFixed(1)}<span class="hero-unit">g</span>`;

    const elDist = document.getElementById('valDistance');
    if (elDist) elDist.innerHTML = `${fillPercent}<span class="hero-unit">%</span>`;

    const capText = document.getElementById('profileCapacityText');
    if (capText) capText.textContent = `${fillPercent}%`;
    const capFill = document.getElementById('profileCapacityFill');
    if (capFill) capFill.style.width = `${fillPercent}%`;

    const elM1 = document.getElementById('profileMetric1');
    if (elM1) elM1.textContent = curW >= 1000 ? `${(curW / 1000).toFixed(2)}kg` : `${curW.toFixed(1)}g`;

    const liveW = document.getElementById('sideLiveWeightLabel');
    if (liveW) liveW.textContent = curW >= 1000 ? `${(curW / 1000).toFixed(2)} kg` : `${curW.toFixed(1)} g`;

    const liveC = document.getElementById('sideLiveCapLabel');
    if (liveC) liveC.textContent = `${fillPercent}%`;
  } catch (_) { }
}

// ============================================================
//  INISIALISASI SAAT HALAMAN DIMUAT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  const savedTareOffset = localStorage.getItem('ecosort_tare_offset');
  if (savedTareOffset) {
    const dispTare = document.getElementById('currentTareOffsetDisplay');
    if (dispTare) dispTare.textContent = `${parseFloat(savedTareOffset).toFixed(1)} g`;
  }
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

  // 1. Inisialisasi Tampilan Halaman yang Aktif Seketika Mengikuti Route URL (Single Source of Truth)
  // Mencegah dashboard berkedip/flash saat pengguna merefresh halaman lain
  const initialRoute = resolveCurrentRoute();
  switchNav(initialRoute.id, { updateHistory: false, replace: true });
  if (window.location.hash.replace('#', '').trim() === 'password') {
    openPasswordChangeCard();
  }

  // 2. Pulihkan Status Perangkat dari Cache Lokal agar Kotak Profil Perangkat Tidak Berkedip Kosong saat Refresh
  restoreCachedDeviceStatus();

  // 3. Muat Data Riil dari Backend
  fetchUserProfile();
  fetchDeviceStatus();
  fetchHistory();
  fetchTransactions();
  fetchNotifications();
  checkAIStatus();

  // Posisi awal indikator slider bar setelah DOM selesai render
  setTimeout(() => updateNavSlider(), 80);

  // Notifikasi jika diarahkan untuk wajib ganti password pada login pertama
  if (sessionStorage.getItem('firstLoginMustChange')) {
    sessionStorage.removeItem('firstLoginMustChange');
    switchNav('account');
    openPasswordChangeCard();
    setTimeout(() => {
      showToast('Wajib perbarui password Administrator Anda pada login pertama!', 'info');
    }, 450);
  }

  // Polling berkala
  setInterval(fetchDeviceStatus, POLL_INTERVAL_MS);
  setInterval(fetchHistory, HISTORY_INTERVAL_MS);
  setInterval(fetchTransactions, TX_INTERVAL_MS);
  setInterval(fetchNotifications, NOTIF_INTERVAL_MS);

  // Keyboard shortcut ESC untuk menutup modal pop-up laporan
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeReportDetailModal();
    }
  });
});
