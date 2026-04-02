// ─── ui.js — UI State, Form, Panels, Settings v4 ──────────
// Bergantung pada: db.js (initDB), api.js (trySync, manualSync)
// Menyediakan global: settings, toast(), loadData(), formatRp()

// ─── State ───────────────────────────────────────────────
let selectedJenis  = '';
let selectedSumber = '';
let localHistory   = [];
let currentFilter  = 'all';
let deferredPrompt = null;
let sidebarVisible = true; // track desktop sidebar state

let settings = {};

const kelompokMap = {
  'Gaji': 'Pemasukan', 'Pendapatan Usaha': 'Pemasukan',
  'Pemberian': 'Pemasukan', 'Bunga & Investasi': 'Pemasukan',
  'Makan & Minum': 'Pengeluaran Rutin', 'Transportasi': 'Pengeluaran Rutin',
  'Utilitas': 'Pengeluaran Rutin', 'Tempat Tinggal': 'Pengeluaran Rutin',
  'Cicilan / Hutang': 'Pengeluaran Rutin',
  'Pengeluaran Variabel': 'Pengeluaran Variabel', 'Kesehatan': 'Pengeluaran Variabel',
  'Kebersihan': 'Pengeluaran Variabel', 'Belanja': 'Pengeluaran Variabel',
  'Kebutuhan Digital': 'Pengeluaran Variabel', 'Pendidikan': 'Pengeluaran Variabel',
  'Sosial & Donasi': 'Pengeluaran Variabel', 'Biaya Admin & Pajak': 'Pengeluaran Variabel',
  'Lain-lain': 'Pengeluaran Variabel',
  'Transfer Antar Akun': 'Non-Pengeluaran', 'Piutang': 'Non-Pengeluaran',
  'Investasi': 'Non-Pengeluaran', 'Penyesuaian Saldo': 'Non-Pengeluaran',
  'Set Saldo': 'Non-Pengeluaran',
};

// ─── Utility ─────────────────────────────────────────────
const formatRp = n => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(n);

// ─── Settings — disimpan di backend Node.js ───────────────
// Settings diambil dari /api/settings saat login (di auth.js).
// ui.js hanya perlu sync form → server saat save.

async function loadSettings() {
  // Settings sudah di-load oleh auth.js saat login.
  // Kalau belum ada (jarang terjadi), coba ambil dari cache offline.
  if (!settings || !settings.scriptUrl) {
    const cached = localStorage.getItem('keuanganku_settings_cache');
    if (cached) try { settings = JSON.parse(cached); } catch {}
  }
  applySettingsToForm();
}

async function saveSettings() {
  if (!isAdmin()) { toast('Hanya Admin yang bisa ubah pengaturan', 'error'); return; }

  const urlEl  = document.getElementById('script-url');
  const nameEl = document.getElementById('sheet-name');
  const newSettings = {
    scriptUrl: urlEl?.value.trim()  || '',
    sheetName: nameEl?.value.trim() || 'Transaksi',
  };

  try {
    // Simpan ke backend (Node.js) — semua device otomatis sinkron
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authState.token,
      },
      body: JSON.stringify(newSettings),
    });
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message);

    settings = newSettings;
    // Update cache offline
    localStorage.setItem('keuanganku_settings_cache', JSON.stringify(settings));
    checkStatus();
    toast('Pengaturan disimpan — semua perangkat akan sinkron', 'success');
  } catch (e) {
    toast('Gagal simpan: ' + (e.message || 'Error server'), 'error');
  }
}

function applySettingsToForm() {
  const urlEl  = document.getElementById('script-url');
  const nameEl = document.getElementById('sheet-name');
  if (urlEl  && settings.scriptUrl) urlEl.value  = settings.scriptUrl;
  if (nameEl && settings.sheetName) nameEl.value = settings.sheetName;
}

// ─── Init ─────────────────────────────────────────────────
function initApp() {
  setTodayDate();
  updateTimestamp();
  setInterval(updateTimestamp, 1000);
  loadSettings();
  checkStatus();
  renderScriptCode();
  loadHistoryFromDB();
}

// ─── Database → UI ────────────────────────────────────────
async function loadData() {
  const db   = await initDB();
  localHistory = await db.getAll('transaksi');
  localHistory.sort((a, b) => b.id - a.id);
  renderHistory();
  renderStats();
  updateBadge();
}

async function loadHistoryFromDB() { await loadData(); }

// ─── Timestamp ────────────────────────────────────────────
function updateTimestamp() {
  const el = document.getElementById('timestamp-display');
  if (!el) return;
  el.textContent = new Date().toLocaleString('id-ID', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
  });
}
function setTodayDate() {
  const el = document.getElementById('tanggal');
  if (el) el.value = new Date().toISOString().split('T')[0];
}

// ─── Panels & Sidebar ─────────────────────────────────────
const PANEL_TITLES = {
  input:    'Input Transaksi',
  saldo:    'Saldo & Ringkasan',
  history:  'Riwayat Lokal',
  settings: 'Pengaturan',
  about:    'Panduan',
};
const PANEL_ORDER = ['input', 'saldo', 'history', 'settings', 'about'];

function showPanel(name) {
  // User mode: block saldo panel
  if (name === 'saldo' && typeof authState !== 'undefined' && authState.unlocked && authState.mode === 'user') {
    toast('Mode User tidak dapat melihat Saldo', 'error');
    return;
  }

  if (name === 'settings' && typeof authState !== 'undefined' && authState.unlocked && authState.mode === 'user') {
    toast('Mode User tidak dapat melihat Pengaturan', 'error');
    return;
  }

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const idx = PANEL_ORDER.indexOf(name);
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[idx]) navItems[idx].classList.add('active');

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PANEL_TITLES[name] || '';

  closeSidebar();

  if (name === 'saldo' && typeof onSaldoPanelOpen === 'function') {
    onSaldoPanelOpen();
  }
}

function toggleSidebar() {
  const isDesktop = window.innerWidth > 768;
  if (isDesktop) {
    // Desktop: toggle hidden class on both sidebar and main
    sidebarVisible = !sidebarVisible;
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main-content');
    if (sidebarVisible) {
      sidebar.classList.remove('sidebar-hidden');
      main.classList.remove('sidebar-hidden');
    } else {
      sidebar.classList.add('sidebar-hidden');
      main.classList.add('sidebar-hidden');
    }
  } else {
    // Mobile: slide-in
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  }
}

function closeSidebar() {
  // Only close on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
  }
}

// ─── Form: Jenis & Sumber ─────────────────────────────────
function selectJenis(val, el) {
  selectedJenis = val;
  document.querySelectorAll('.jenis-btn').forEach(b => b.className = 'jenis-btn');
  const cls = val === 'Masuk' ? 'active-masuk' : val === 'Keluar' ? 'active-keluar' : 'active-netral';
  el.classList.add(cls);
}

function selectSumber(val, el) {
  selectedSumber = val;
  document.querySelectorAll('.sumber-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('sumber').value = val;
}

function updateKelompok(val) {
  const el = document.getElementById('kelompok');
  if (el) el.value = kelompokMap[val] || '';
}

function updateNominalDisplay(inp) {
  const el  = document.getElementById('nominal-display');
  const val = parseFloat(inp.value);
  if (el) el.textContent = (!val || isNaN(val)) ? '' : formatRp(val);
}

// ─── Submit ───────────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  if (!selectedJenis || !selectedSumber) {
    toast('Pilih Jenis dan Sumber Uang terlebih dahulu!', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.classList.add('loading');

  const nominal = parseFloat(document.getElementById('nominal').value) || 0;

  const data = {
    id:        Date.now(),
    timestamp: document.getElementById('timestamp-display').textContent,
    tanggal:   document.getElementById('tanggal').value,
    deskripsi: document.getElementById('deskripsi').value.trim(),
    kategori:  document.getElementById('kategori').value,
    jenis:     selectedJenis,
    nominal:   selectedJenis === 'Netral' ? -Math.abs(nominal) : nominal,
    sumber:    selectedSumber,
    kelompok:  document.getElementById('kelompok').value,
    sent:      false,
  };

  try {
    const db = await initDB();
    await db.add('transaksi', data);
    await loadData();
    resetForm(true);
    toast('Tersimpan di lokal', 'success');
    trySync();
  } catch (err) {
    toast('Gagal menyimpan lokal', 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function resetForm(keepDate = false) {
  const fields = ['deskripsi', 'nominal', 'kategori', 'kelompok'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const nomDisplay = document.getElementById('nominal-display');
  if (nomDisplay) nomDisplay.textContent = '';
  document.querySelectorAll('.jenis-btn').forEach(b => b.className = 'jenis-btn');
  document.querySelectorAll('.sumber-pill').forEach(p => p.classList.remove('active'));
  const sumberInput = document.getElementById('sumber');
  if (sumberInput) sumberInput.value = '';
  selectedJenis  = '';
  selectedSumber = '';
  if (!keepDate) setTodayDate();
}

// ─── History ──────────────────────────────────────────────
function filterHistory(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-container');
  if (!container) return;

  const isAdminMode = typeof isAdmin === 'function' && isAdmin();
  const isUserMode  = typeof isUser  === 'function' && isUser();

  const filtered = currentFilter === 'all'
    ? localHistory
    : localHistory.filter(h => h.jenis === currentFilter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="history-empty">
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px">Belum ada data</div>
        <p style="font-size:12px;color:var(--text3)">Data yang diinput akan muncul di sini</p>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="history-list">${filtered.map(h => {
    const dotCls = h.jenis === 'Masuk' ? 'dot-masuk' : h.jenis === 'Keluar' ? 'dot-keluar' : 'dot-netral';
    const nomCls = h.jenis === 'Masuk' ? 'masuk-color' : h.jenis === 'Keluar' ? 'keluar-color' : 'netral-color';
    const sign   = h.jenis === 'Masuk' ? '+' : h.jenis === 'Keluar' ? '-' : '';

    // Action buttons — only shown to admin
    let actionBtns = '';
    if (isAdminMode || (!isAdminMode && !isUserMode)) {
      // Show actions in admin mode or when no auth is active
      if (!h.sent) {
        actionBtns = `
          <button class="history-action-btn btn-resend" onclick="manualSync(${h.id})" title="Kirim Ulang">Kirim Ulang</button>
          <button class="history-action-btn btn-delete"  onclick="deleteItem(${h.id})" title="Hapus">Hapus</button>`;
      } else {
        actionBtns = `
          <span class="btn-sent-tag">Terkirim</span>
          <button class="history-action-btn btn-delete" onclick="deleteItem(${h.id})" title="Hapus">Hapus</button>`;
      }
    } else if (isUserMode) {
      // User mode: no actions
      actionBtns = h.sent
        ? `<span class="btn-sent-tag">Terkirim</span>`
        : `<span style="font-size:11px;color:var(--amber)">Pending</span>`;
    }

    return `
      <div class="history-item">
        <div class="history-dot ${dotCls}"></div>
        <div class="history-body">
          <div class="history-desc">${h.deskripsi}</div>
          <div class="history-meta">${h.tanggal} · ${h.kategori}</div>
        </div>
        <div class="history-right" style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <div class="history-nominal ${nomCls}">${sign}${formatRp(h.nominal)}</div>
            <div class="history-sumber">${h.sumber}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            ${actionBtns}
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

async function deleteItem(id) {
  if (!confirm('Hapus data ini dari riwayat lokal?')) return;
  try {
    const db = await initDB();
    await db.delete('transaksi', id);
    await loadData();
    toast('Data dihapus dari lokal', 'info');
  } catch {
    toast('Gagal menghapus data', 'error');
  }
}

async function clearLocalData() {
  if (!confirm('Hapus semua data lokal? Data di Google Sheets tetap aman.')) return;
  try {
    const db = await initDB();
    await db.clear('transaksi');
    await loadData();
    toast('Data lokal dihapus', 'info');
  } catch {
    toast('Gagal menghapus', 'error');
  }
}

// ─── Stats ────────────────────────────────────────────────
function renderStats() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const isUserMode = typeof isUser === 'function' && isUser();

  const masuk  = localHistory.filter(h => h.jenis === 'Masuk').reduce((a, b) => a + b.nominal, 0);
  const keluar = localHistory.filter(h => h.jenis === 'Keluar').reduce((a, b) => a + b.nominal, 0);

  if (isUserMode) {
    // User mode: hide balance amounts
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Jumlah Transaksi</div>
        <div class="stat-val" style="color:var(--text)">${localHistory.length}</div>
      </div>`;
  } else {
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Masuk</div>
        <div class="stat-val masuk-color">${formatRp(masuk)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Keluar</div>
        <div class="stat-val keluar-color">${formatRp(keluar)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Semua Data</div>
        <div class="stat-val" style="color:var(--text)">${localHistory.length}</div>
      </div>`;
  }
}

function updateBadge() {
  const badge  = document.getElementById('badge-queue');
  if (!badge) return;
  const unsent = localHistory.filter(h => !h.sent).length;
  badge.style.display = unsent > 0 ? '' : 'none';
  badge.textContent   = unsent;
}

// ─── Status ───────────────────────────────────────────────
function checkStatus() {
  const active  = !!settings.scriptUrl;
  const dotEl   = document.getElementById('status-dot');
  const valEl   = document.getElementById('status-value');
  const iconEl  = document.getElementById('status-icon');

  if (dotEl)  dotEl.className       = active ? 'status-dot connected' : 'status-dot';
  if (valEl)  valEl.textContent     = active ? (settings.sheetName || 'Terhubung') : 'Belum terhubung';
  if (iconEl) iconEl.textContent    = active ? 'OK' : '—';

  if (active) checkInstallBanner();
}

async function testConnection() {
  if (!settings.scriptUrl) { toast('Simpan URL Apps Script dahulu', 'error'); return; }
  toast('Menguji koneksi...', 'info');
  try {
    await fetch(settings.scriptUrl + '?test=1', { mode: 'no-cors' });
    toast('Koneksi berhasil (no-cors)', 'success');
  } catch {
    toast('Gagal terhubung', 'error');
  }
}

// ─── PIN Management (from settings panel) ─────────────────
function changePinAdmin() {
  if (typeof lockApp === 'function') {
    // Switch to admin tab and go to setup
    lockApp();
    setTimeout(() => {
      switchAuthTab('admin');
      startPinSetup();
    }, 350);
  }
}

function changePinUser() {
  if (typeof lockApp === 'function') {
    lockApp();
    setTimeout(() => {
      switchAuthTab('user');
      startPinSetup();
    }, 350);
  }
}

// ─── Export CSV ───────────────────────────────────────────
function exportCSV() {
  if (!localHistory.length) { toast('Tidak ada data', 'info'); return; }

  const rows = [
    ['Timestamp','Tanggal','Deskripsi','Kategori','Jenis','Nominal','Sumber','Kelompok','Status'],
    ...localHistory.map(h => [
      h.timestamp, h.tanggal, `"${h.deskripsi}"`,
      h.kategori, h.jenis, h.nominal, h.sumber, h.kelompok,
      h.sent ? 'Terkirim' : 'Lokal',
    ]),
  ];
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `keuanganku_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('CSV berhasil diexport', 'success');
}

// ─── Toast ────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el     = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.opacity    = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ─── PWA Install Banner ───────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  checkInstallBanner();
});

function checkInstallBanner() {
  if (!deferredPrompt) return;
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.style.display = 'flex';
  document.getElementById('btn-install').onclick = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') banner.style.display = 'none';
    deferredPrompt = null;
  };
}

// ─── Apps Script Code Display ─────────────────────────────
function renderScriptCode() {
  const el = document.getElementById('script-code');
  if (!el) return;
  el.textContent = `function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // Handle saveSettings action
    if (e.parameter.action === 'saveSettings') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('AppSettings');
      if (!sheet) sheet = ss.insertSheet('AppSettings');
      const data = JSON.parse(e.parameter.settingsJson || '{}');
      sheet.clearContents();
      sheet.appendRow(['key', 'value']);
      Object.entries(data).forEach(([k, v]) => sheet.appendRow([k, v]));
      return ContentService.createTextOutput(
        JSON.stringify({status:'ok'})
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const SHEET_NAME = e.parameter.sheetName || 'Transaksi';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp','Tanggal Input','Deskripsi',
        'Kategori','Jenis','Nominal','Sumber Uang','Kelompok Kategori']);
      sheet.getRange(1,1,1,8).setFontWeight('bold');
    }

    const timestampBaru = e.parameter.timestamp;
    const deskripsiBaru = e.parameter.deskripsi;
    const dataBaru = [
      timestampBaru, e.parameter.tanggal, deskripsiBaru,
      e.parameter.kategori, e.parameter.jenis,
      parseFloat(e.parameter.nominal) || 0,
      e.parameter.sumber, e.parameter.kelompok
    ];

    const lastRow = sheet.getLastRow();
    let isDuplicate = false;
    if (lastRow > 1) {
      const startRow   = Math.max(1, lastRow - 10);
      // PERBAIKAN 1: Gunakan getDisplayValues() agar format string tidak berubah jadi Object Date
      const lastValues = sheet.getRange(startRow, 1, lastRow - startRow + 1, 3).getDisplayValues();
      isDuplicate = lastValues.some(row =>
        row[0] === timestampBaru && row[2] === deskripsiBaru
      );
    }

    if (!isDuplicate) {
      sheet.appendRow(dataBaru);
      return ContentService.createTextOutput(
        JSON.stringify({status:'success',message:'Data berhasil dicatat'})
      ).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({status:'duplicate',message:'Data sudah ada'})
      ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(
      JSON.stringify({status:'error',message:err.toString()})
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // Ambil settings tersimpan
  if (e.parameter.action === 'getSettings') {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('AppSettings');
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(
        JSON.stringify({status:'ok', data:{}})
      ).setMimeType(ContentService.MimeType.JSON);
    }
    const rows = sheet.getRange(2, 1, sheet.getLastRow()-1, 2).getValues();
    const data = {};
    rows.forEach(r => { if (r[0]) data[r[0]] = r[1]; });
    return ContentService.createTextOutput(
      JSON.stringify({status:'ok', data})
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Endpoint saldo
  if (e.parameter.action === 'saldo') {
    const SHEET_NAME = e.parameter.sheetName || 'Transaksi';
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        status:'ok',
        data:{ masuk:0, keluar:0, saldo:0, txnCount:0,
               masukCount:0, keluarCount:0, perSumber:[] }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const rows = sheet.getRange(2, 1, sheet.getLastRow()-1, 8).getValues();
    
    // PERBAIKAN 2: Tambahkan tracking khusus untuk netral
    let masuk=0, keluar=0, netralTotal=0, masukCount=0, keluarCount=0;
    const sumberMap = {};
    
    rows.forEach(r => {
      const jenis   = r[4];
      const nominal = parseFloat(r[5]) || 0;
      const sumber  = r[6] || 'Lainnya';
      
      if (!sumberMap[sumber]) sumberMap[sumber]={masuk:0, keluar:0, netral:0, txn:0};
      sumberMap[sumber].txn++;
      
      if (jenis === 'Masuk') {
          masuk += nominal;
          masukCount++;
          sumberMap[sumber].masuk += nominal;
      } else if (jenis === 'Keluar') {
        keluar += nominal;
        keluarCount++;
        sumberMap[sumber].keluar += nominal;
      } else if (jenis === 'Netral') {
        netralTotal += nominal;
        sumberMap[sumber].netral += nominal;
      }
    });

    // Hitung saldo = Masuk - Keluar + Netral (karena Netral udah diset minus dari front-end jika itu pengurang)
    const perSumber = Object.entries(sumberMap).map(([nama,v])=>({
      nama, 
      masuk: v.masuk, 
      keluar: v.keluar,
      saldo: v.masuk - v.keluar + v.netral, 
      txn: v.txn
    })).sort((a,b) => b.saldo - a.saldo);

    return ContentService.createTextOutput(JSON.stringify({
      status:'ok',
      data:{ 
        masuk, 
        keluar, 
        saldo: masuk - keluar + netralTotal,
        txnCount: rows.length, 
        masukCount, 
        keluarCount, 
        perSumber 
      }
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({status:'alive'})
  ).setMimeType(ContentService.MimeType.JSON);
}`;
}

function copyScript() {
  const code = document.getElementById('script-code')?.textContent || '';
  navigator.clipboard.writeText(code).then(() => toast('Kode berhasil di-copy', 'success'));
}
