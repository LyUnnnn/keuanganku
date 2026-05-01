// ─── auth.js — PIN Authentication via Backend API ─────────
// PIN & settings disimpan di server (Node.js), bukan localStorage.
// Sesi autentikasi disimpan sebagai cookie HttpOnly di backend.

const AUTH_MODE_KEY  = 'keuanganku_mode';
const API_BASE       = '/api';

let authState = {
  unlocked: false,
  mode: null,        // 'admin' | 'user'
  token: null,
};

function isAdmin() { return authState.unlocked && authState.mode === 'admin'; }
function isUser()  { return authState.unlocked && authState.mode === 'user'; }

// ─── API Helpers ──────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    credentials: 'same-origin',
  });
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Session management ───────────────────────────────────
function saveSession(mode) {
  sessionStorage.setItem(AUTH_MODE_KEY, mode);
  authState.mode     = mode;
  authState.unlocked = true;
  authState.token    = null;
}

async function clearSession() {
  sessionStorage.removeItem(AUTH_MODE_KEY);
  authState = { unlocked: false, mode: null, token: null };
  try {
    await apiPost('/logout', {});
  } catch {}
}

async function restoreSession() {
  try {
    const res = await apiGet('/verify');
    if (res.status === 'ok') {
      authState.unlocked = true;
      authState.mode     = res.mode || sessionStorage.getItem(AUTH_MODE_KEY) || null;
      authState.token    = null;
      if (authState.mode) sessionStorage.setItem(AUTH_MODE_KEY, authState.mode);
      return true;
    }
  } catch {}

  await clearSession();
  return false;
}

// ─── UI State ─────────────────────────────────────────────
let authCurrentTab  = 'admin';
let authPinBuffer   = '';
let authSetupPhase  = null; // null | 'enter1' | 'enter2' | 'setup-both'
let authSetupFirst  = '';
let authSetupAdminPin = '';
let serverStatus    = null; // hasil /api/status

// ─── Build Overlay ────────────────────────────────────────
function buildAuthOverlay() {
  const existing = document.getElementById('auth-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id    = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-box" id="auth-box">
      <div class="auth-logo">
        <div class="auth-logo-icon">KK</div>
        <div class="auth-logo-title">KeuanganKu</div>
        <div class="auth-logo-sub" id="auth-subtitle">Memuat...</div>
      </div>

      <!-- Mode tabs (hanya tampil kalau bukan setup awal) -->
      <div class="auth-mode-tabs" id="auth-mode-tabs" style="display:none">
        <button class="auth-tab active" id="tab-admin" onclick="switchAuthTab('admin')">Admin</button>
        <button class="auth-tab"        id="tab-user"  onclick="switchAuthTab('user')">User</button>
      </div>

      <!-- PIN dots -->
      <div class="auth-pin-display" id="auth-pin-display" style="display:none">
        <span class="pin-dot" id="dot-0"></span>
        <span class="pin-dot" id="dot-1"></span>
        <span class="pin-dot" id="dot-2"></span>
        <span class="pin-dot" id="dot-3"></span>
      </div>

      <div class="auth-hint" id="auth-hint"></div>

      <!-- Numpad -->
      <div class="auth-numpad" id="auth-numpad" style="display:none">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
          <button class="auth-key ${k==='' ? 'auth-key-empty' : ''}"
                  ${k==='' ? 'disabled' : ''}
                  onclick="authKeyPress('${k}')">
            ${k}
          </button>`).join('')}
      </div>

      <div class="auth-status" id="auth-status"></div>

      <!-- Loading spinner -->
      <div class="auth-loading" id="auth-loading">
        <div class="auth-spinner"></div>
        <span>Menghubungi server...</span>
      </div>

      <!-- Error / retry -->
      <div class="auth-server-error" id="auth-server-error" style="display:none">
        <p>Tidak dapat terhubung ke server.</p>
        <button class="auth-setup-btn" onclick="initAuth()">Coba Lagi</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ─── Auth flow controller ─────────────────────────────────
async function startAuthFlow() {
  setAuthLoading(true);
  hideAuthServerError();

  try {
    serverStatus = await apiGet('/status');
  } catch (e) {
    setAuthLoading(false);
    showAuthServerError();
    return;
  }

  setAuthLoading(false);

  if (!serverStatus.initialized) {
    // Belum ada PIN sama sekali — jalankan wizard setup
    startFirstTimeSetup();
  } else {
    // Sudah ada PIN — tampilkan form login
    showLoginForm();
  }
}

// ─── First-time Setup Wizard ──────────────────────────────
function startFirstTimeSetup() {
  document.getElementById('auth-subtitle').textContent = 'Setup PIN pertama kali';
  document.getElementById('auth-mode-tabs').style.display = 'none';
  showPinDots();
  showNumpad();

  authSetupPhase  = 'admin-enter1';
  authPinBuffer   = '';
  authSetupFirst  = '';
  setAuthHint('Buat PIN Admin (4 digit)');
  setAuthStatus('');
}

// ─── Login Form ───────────────────────────────────────────
function showLoginForm() {
  document.getElementById('auth-subtitle').textContent = 'Masukkan PIN untuk melanjutkan';
  document.getElementById('auth-mode-tabs').style.display = 'flex';

  const tabUser = document.getElementById('tab-user');
  if (tabUser) tabUser.style.display = serverStatus.userPinSet ? '' : 'none';

  showPinDots();
  showNumpad();

  authSetupPhase = null; 
  
  authCurrentTab = 'admin';
  authPinBuffer  = '';
  setAuthHint('Masukkan PIN Admin');
  setAuthStatus('');
  updateTabActive();
}

// ─── Tab switch ───────────────────────────────────────────
function switchAuthTab(mode) {
  authCurrentTab = mode;
  authPinBuffer  = '';
  clearPinDots();
  setAuthStatus('');
  setAuthHint(mode === 'admin' ? 'Masukkan PIN Admin' : 'Masukkan PIN User');
  updateTabActive();
}

function updateTabActive() {
  document.getElementById('tab-admin')?.classList.toggle('active', authCurrentTab === 'admin');
  document.getElementById('tab-user')?.classList.toggle('active', authCurrentTab === 'user');
}

// ─── Key press handler ────────────────────────────────────
function authKeyPress(key) {
  if (key === '⌫') {
    authPinBuffer = authPinBuffer.slice(0, -1);
    updatePinDots();
    return;
  }
  if (key === '' || authPinBuffer.length >= 4) return;
  authPinBuffer += key;
  updatePinDots();
  if (authPinBuffer.length === 4) setTimeout(handlePinComplete, 120);
}

async function handlePinComplete() {
  // ── Setup wizard: Admin PIN enter 1 ──
  if (authSetupPhase === 'admin-enter1') {
    authSetupAdminPin = authPinBuffer;
    authPinBuffer     = '';
    authSetupPhase    = 'admin-enter2';
    clearPinDots();
    setAuthHint('Ulangi PIN Admin untuk konfirmasi');
    return;
  }

  // ── Setup wizard: Admin PIN enter 2 ──
  if (authSetupPhase === 'admin-enter2') {
    if (authPinBuffer !== authSetupAdminPin) {
      setAuthStatus('PIN tidak cocok, ulangi dari awal', 'error');
      authSetupPhase = 'admin-enter1';
      authPinBuffer  = '';
      authSetupAdminPin = '';
      setTimeout(() => { clearPinDots(); setAuthStatus(''); setAuthHint('Buat PIN Admin (4 digit)'); }, 800);
      return;
    }
    // Lanjut setup user PIN
    authSetupPhase = 'user-enter1';
    authPinBuffer  = '';
    authSetupFirst = '';
    clearPinDots();
    setAuthHint('Buat PIN User (4 digit) — atau skip');
    setAuthStatus('PIN Admin OK! Sekarang buat PIN User.', 'success');
    setTimeout(() => setAuthStatus(''), 1500);
    // Tambahkan tombol skip
    showSkipButton();
    return;
  }

  // ── Setup wizard: User PIN enter 1 ──
  if (authSetupPhase === 'user-enter1') {
    authSetupFirst = authPinBuffer;
    authPinBuffer  = '';
    authSetupPhase = 'user-enter2';
    clearPinDots();
    hideSkipButton();
    setAuthHint('Ulangi PIN User untuk konfirmasi');
    return;
  }

  // ── Setup wizard: User PIN enter 2 ──
  if (authSetupPhase === 'user-enter2') {
    if (authPinBuffer !== authSetupFirst) {
      setAuthStatus('PIN tidak cocok, ulangi', 'error');
      authSetupPhase = 'user-enter1';
      authPinBuffer  = '';
      authSetupFirst = '';
      setTimeout(() => { clearPinDots(); setAuthStatus(''); setAuthHint('Buat PIN User (4 digit)'); showSkipButton(); }, 800);
      return;
    }
    // Kirim ke server
    await finishSetup(authSetupAdminPin, authPinBuffer);
    return;
  }

  // ── Normal login ──
  await doLogin(authCurrentTab, authPinBuffer);
}

async function finishSetup(adminPin, userPin) {
  setAuthLoading(true);
  setAuthHint('');
  try {
    const res = await apiPost('/setup', { adminPin, userPin });
    if (res.status === 'ok') {
      authSetupPhase = null;
      setAuthStatus('Setup berhasil! Masuk sebagai Admin...', 'success');
      // Auto-login sebagai admin
      setTimeout(() => doLogin('admin', adminPin), 800);
    } else {
      throw new Error(res.message);
    }
  } catch (e) {
    setAuthLoading(false);
    setAuthStatus('Gagal setup: ' + (e.message || 'Error'), 'error');
    setTimeout(() => startFirstTimeSetup(), 1500);
  }
}

async function skipUserPin() {
  // Setup hanya admin PIN tanpa user PIN
  hideSkipButton();
  setAuthLoading(true);
  try {
    const res = await apiPost('/setup', { adminPin: authSetupAdminPin });
    if (res.status === 'ok') {
      authSetupPhase = null;
      setAuthStatus('Setup berhasil!', 'success');
      setTimeout(() => doLogin('admin', authSetupAdminPin), 800);
    } else throw new Error(res.message);
  } catch (e) {
    setAuthLoading(false);
    setAuthStatus('Gagal: ' + (e.message || 'Error'), 'error');
    setTimeout(() => startFirstTimeSetup(), 1500);
  }
}

async function doLogin(mode, pin) {
  setAuthLoading(true);
  document.getElementById('auth-numpad').style.opacity = '0.4';
  try {
    const res = await apiPost('/login', { pin, mode });
    if (res.status === 'ok') {
      setAuthStatus('Akses diberikan!', 'success');

      // Load settings dari server sebelum dismiss
      saveSession(res.mode);

      try {
        const sRes = await apiGet('/settings');
        if (sRes.status === 'ok' && sRes.data) {
          settings = { ...sRes.data };
          // Simpan cache lokal tanpa URL agar tidak mudah terlihat di browser
          localStorage.setItem('keuanganku_settings_cache', JSON.stringify({
            sheetName: (settings.sheetName === 'Hutang' || settings.sheetName === 'Piutang' || !settings.sheetName)
              ? 'Transaksi'
              : settings.sheetName,
          }));
        }
      } catch {}

      setTimeout(() => {
        dismissAuthOverlay();
        applyModeRestrictions();
        checkStatus();
        if (typeof loadData === 'function') {
          loadData();
        }
      }, 400);
    } else {
      throw new Error(res.message || 'PIN salah');
    }
  } catch (e) {
    setAuthLoading(false);
    document.getElementById('auth-numpad').style.opacity = '1';
    setAuthStatus(e.message || 'PIN salah', 'error');
    authPinBuffer = '';
    setTimeout(() => { clearPinDots(); setAuthStatus(''); }, 900);
  }
}

// ─── UI helpers ───────────────────────────────────────────
function setAuthLoading(show) {
  const el = document.getElementById('auth-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
  const numpad = document.getElementById('auth-numpad');
  if (numpad) numpad.style.display = show ? 'none' : 'grid';
  const dots = document.getElementById('auth-pin-display');
  if (dots) dots.style.display = show ? 'none' : 'flex';
}

function showAuthServerError() {
  document.getElementById('auth-server-error').style.display = 'block';
  document.getElementById('auth-loading').style.display      = 'none';
}

function hideAuthServerError() {
  document.getElementById('auth-server-error').style.display = 'none';
}

function showPinDots() { document.getElementById('auth-pin-display').style.display = 'flex'; }
function showNumpad()  { document.getElementById('auth-numpad').style.display = 'grid'; }

function showSkipButton() {
  if (document.getElementById('auth-skip-btn')) return;
  const btn = document.createElement('button');
  btn.id        = 'auth-skip-btn';
  btn.className = 'auth-skip-btn';
  btn.textContent = 'Skip — tidak perlu PIN User';
  btn.onclick   = skipUserPin;
  document.getElementById('auth-box').appendChild(btn);
}

function hideSkipButton() {
  document.getElementById('auth-skip-btn')?.remove();
}

function clearPinDots() { authPinBuffer = ''; updatePinDots(); }

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById('dot-' + i)?.classList.toggle('filled', i < authPinBuffer.length);
  }
}

function setAuthHint(msg)        { const el = document.getElementById('auth-hint');   if (el) el.textContent = msg; }
function setAuthStatus(msg, cls) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'auth-status' + (cls ? ' ' + cls : '');
}

function dismissAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.add('auth-fadeout');
    setTimeout(() => overlay.remove(), 300);
  }
}

// ─── Mode Restrictions ────────────────────────────────────
function applyModeRestrictions() {
  document.body.classList.remove('mode-admin', 'mode-user');
  document.body.classList.add('mode-' + authState.mode);

  if (authState.mode === 'user') {
    
    document.querySelectorAll('.saldo-panel-link').forEach(el => el.style.display = 'none');
    document.getElementById('nav-utang')?.style.setProperty('display', 'none');
    showPanel('input');
  } else {
    document.querySelectorAll('.saldo-panel-link').forEach(el => el.style.display = '');
    document.getElementById('nav-utang')?.style.setProperty('display', '');
  }

  renderStats();    // Re-render stats (user mode menyembunyikan nominal)
  renderHistory();  // Re-render history (user mode menyembunyikan action buttons)
  updateModeBadge();
}

function updateModeBadge() {
  let badge = document.getElementById('mode-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'mode-badge';
    const footer = document.querySelector('.sidebar-footer');
    if (footer) footer.prepend(badge);
  }
  const label = authState.mode === 'admin' ? 'Admin' : 'User';
  const cls   = authState.mode === 'admin' ? 'badge-admin' : 'badge-user';
  badge.className = 'mode-badge ' + cls;
  badge.innerHTML = `
    <span class="mode-badge-dot"></span>${label} Mode
    <button class="mode-badge-lock" onclick="lockApp()">Kunci</button>`;
}

function lockApp() {
  clearSession();
  document.body.classList.remove('mode-admin', 'mode-user');
  document.getElementById('mode-badge')?.remove();
  // Reset settings (jangan simpan scriptUrl di memori setelah logout)
  settings = {};
  buildAuthOverlay();
  startAuthFlow();
}

// ─── Change PIN dari Settings Panel ──────────────────────
async function changePinAdmin() { await changePin('admin'); }
async function changePinUser()  { await changePin('user');  }

async function changePin(mode) {
  if (!isAdmin()) { toast('Hanya Admin yang bisa ganti PIN', 'error'); return; }

  const pin1 = prompt(`Masukkan PIN ${mode} baru (4 digit):`);
  if (!pin1) return;
  if (!/^\d{4}$/.test(pin1)) { toast('PIN harus 4 digit angka', 'error'); return; }

  const pin2 = prompt(`Ulangi PIN ${mode} baru:`);
  if (pin1 !== pin2) { toast('PIN tidak cocok', 'error'); return; }

  try {
    const res = await apiPost('/change-pin', { mode, newPin: pin1 });
    if (res.status === 'ok') {
      toast(`PIN ${mode} berhasil diubah`, 'success');
    } else {
      toast(res.message || 'Gagal ubah PIN', 'error');
    }
  } catch {
    toast('Gagal menghubungi server', 'error');
  }
}

// ─── Boot ─────────────────────────────────────────────────
async function initAuth() {
  buildAuthOverlay();
  hideAuthServerError();

  // Coba restore session yang masih valid
  const restored = await restoreSession();
  if (restored) {
    // Session valid — langsung masuk tanpa PIN
    try {
      const sRes = await apiGet('/settings');
      if (sRes.status === 'ok') {
        settings = { ...sRes.data };
        localStorage.setItem('keuanganku_settings_cache', JSON.stringify({
          sheetName: (settings.sheetName === 'Hutang' || settings.sheetName === 'Piutang' || !settings.sheetName)
            ? 'Transaksi'
            : settings.sheetName,
        }));
      }
    } catch {
      // Fallback ke cache offline
      const cached = localStorage.getItem('keuanganku_settings_cache');
      if (cached) try {
        const parsed = JSON.parse(cached);
        settings = { ...parsed };
        localStorage.setItem('keuanganku_settings_cache', JSON.stringify({
          sheetName: (settings.sheetName === 'Hutang' || settings.sheetName === 'Piutang' || !settings.sheetName)
            ? 'Transaksi'
            : settings.sheetName,
        }));
      } catch {}
    }
    dismissAuthOverlay();
    applyModeRestrictions();
    checkStatus();
    if (typeof loadData === 'function') {
      loadData();
    }
    return;
  }

  // Belum ada session — tampilkan auth overlay
  await startAuthFlow();
}

// ─── Keyboard Support ─────────────────────────────────────
document.addEventListener('keydown', (event) => {
  // Hanya proses jika overlay login sedang tampil di layar
  if (!document.getElementById('auth-overlay')) return;

  const key = event.key;

  // Tangkap input angka 0-9 dari keyboard (termasuk Numpad)
  if (/^[0-9]$/.test(key)) {
    authKeyPress(key);
  } 
  // Tangkap tombol Backspace untuk menghapus
  else if (key === 'Backspace') {
    authKeyPress('⌫');
  }
});
