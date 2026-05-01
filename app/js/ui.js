// ─── ui.js — UI State, Form, Panels, Settings v4 ──────────
// Bergantung pada: db.js (initDB), api.js (trySync, manualSync)
// Menyediakan global: settings, toast(), loadData(), formatRp()

// ─── State ───────────────────────────────────────────────
let selectedJenis  = '';
let selectedSumber = '';
let localHistory   = [];
let debtHistory    = [];
let currentFilter  = 'all';
let currentSourceFilter = 'all';
let currentMonthFilter = 'all';
let currentDebtFilter = 'all';
let currentDebtSourceFilter = 'all';
let deferredPrompt = null;
let sidebarVisible = true; // track desktop sidebar state

let settings = {};
let selectedDebtType = 'Hutang';

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

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMainSheetName(name) {
  const value = String(name ?? '').trim();
  if (!value || value === 'Hutang' || value === 'Piutang') return 'Transaksi';
  return value;
}

function buildTransactionKey(item) {
  return [
    item.recordType || 'transaksi',
    item.timestamp || '',
    item.tanggal || '',
    item.deskripsi || '',
    item.kategori || '',
    item.jenis || '',
    item.nominal ?? '',
    item.sumber || '',
    item.kelompok || '',
  ].join('|');
}

function buildDebtKey(item) {
  return [
    item.recordType || 'hutang',
    item.tanggal || '',
    item.jatuhTempo || '',
    item.deskripsi || '',
    item.pemberiUtang || '',
    item.nominal ?? '',
    item.status || '',
    item.pengingat || '',
    item.jenisUtang || '',
  ].join('|');
}

function normalizeServerTransactionRow(row) {
  return {
    id: row.id != null ? `srv-tx-${row.id}` : `srv-tx-${row.sheetRow}`,
    source: 'server',
    sent: true,
    recordType: 'transaksi',
    timestamp: row.timestamp || '',
    tanggal: row.tanggal || '',
    deskripsi: row.deskripsi || '',
    kategori: row.kategori || '',
    jenis: row.jenis || '',
    nominal: parseFloat(row.nominal) || 0,
    sumber: row.sumber || '',
    kelompok: row.kelompok || '',
    sheetName: 'Transaksi',
    sortKey: row.updatedAt || row.createdAt || row.sheetRow || 0,
  };
}

function normalizeServerDebtRow(row, sheetName) {
  return {
    id: row.id != null ? `srv-${sheetName.toLowerCase()}-${row.id}` : `srv-${sheetName.toLowerCase()}-${row.sheetRow}`,
    source: 'server',
    sent: true,
    recordType: sheetName.toLowerCase(),
    timestamp: '',
    tanggal: row.tanggal || '',
    jatuhTempo: row.jatuhTempo || '',
    deskripsi: row.deskripsi || '',
    pemberiUtang: row.pemberiUtang || '',
    nominal: parseFloat(row.nominal) || 0,
    status: row.status || 'Belum dibayar',
    pengingat: row.pengingat || 'BELUM',
    jenisUtang: row.jenisUtang || 'Transaksi',
    sheetName,
    sortKey: row.updatedAt || row.createdAt || row.sheetRow || 0,
  };
}

function mergeRows(primaryRows, localRows, keyBuilder) {
  const seen = new Set();
  const merged = [];
  const push = (item) => {
    const key = keyBuilder(item);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  primaryRows.forEach(push);
  localRows.forEach(push);
  merged.sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
  return merged;
}

function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value;
  const str = String(value).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s].*)?$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isCurrentMonthDate(value) {
  const d = parseAnyDate(value);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function sourceLabel(item) {
  return item.source === 'server' ? 'Server' : 'Lokal';
}

function buildMonthKey(value) {
  const d = parseAnyDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key) {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function formatDateLabel(value) {
  const d = parseAnyDate(value);
  if (!d) return String(value ?? '');
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatAddedAt(value) {
  if (!value) return '';
  const str = String(value).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}, ${String(m[4]).padStart(2, '0')}:${m[5]}`;
  }
  const parsed = parseAnyDate(str);
  if (parsed) {
    return parsed.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/\./g, ':');
  }
  return str;
}

function updateHistoryMonthOptions(rows) {
  const select = document.getElementById('history-month-filter');
  if (!select) return;

  const current = currentMonthFilter || getCurrentMonthKey();
  const keys = [...new Set(rows.map(row => buildMonthKey(row.tanggal)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  select.innerHTML = `<option value="all">Semua Bulan</option>${
    keys.map(key => `<option value="${key}">${escapeHTML(formatMonthLabel(key))}</option>`).join('')
  }`;
  if (keys.includes(current)) {
    select.value = current;
    currentMonthFilter = current;
  } else if (keys.length) {
    select.value = keys[0];
    currentMonthFilter = keys[0];
  } else {
    select.value = 'all';
    currentMonthFilter = 'all';
  }
}

// ─── Settings — disimpan di backend Node.js ───────────────
// Settings diambil dari /api/settings saat login (di auth.js).
// ui.js hanya perlu sync form → server saat save.

async function loadSettings() {
  // Settings sudah di-load oleh auth.js saat login.
  // Kalau belum ada (jarang terjadi), coba ambil dari cache offline.
  if (!settings || !settings.scriptUrl) {
    const cached = localStorage.getItem('keuanganku_settings_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        settings = { ...(settings || {}), ...parsed };
        localStorage.setItem('keuanganku_settings_cache', JSON.stringify({
          sheetName: normalizeMainSheetName(settings.sheetName),
        }));
      } catch {}
    }
  }
  applySettingsToForm();
}

async function saveSettings() {
  if (!isAdmin()) { toast('Hanya Admin yang bisa ubah pengaturan', 'error'); return; }

  const urlEl  = document.getElementById('script-url');
  const nameEl = document.getElementById('sheet-name');
  const scriptUrl = urlEl?.value.trim() || '';
  const sheetName = normalizeMainSheetName(nameEl?.value);
  const newSettings = { sheetName };
  if (scriptUrl) newSettings.scriptUrl = scriptUrl;

  try {
    // Simpan ke backend (Node.js) — semua device otomatis sinkron
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(newSettings),
    });
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message);

    settings = {
      ...(settings || {}),
      sheetName,
      ...(scriptUrl ? { scriptUrl } : {}),
    };
    // Simpan cache offline tanpa URL agar tidak mudah dilihat di browser.
    localStorage.setItem('keuanganku_settings_cache', JSON.stringify({
      sheetName: normalizeMainSheetName(settings.sheetName),
    }));
    if (urlEl) urlEl.value = '';
    checkStatus();
    toast('Pengaturan disimpan — semua perangkat akan sinkron', 'success');
  } catch (e) {
    toast('Gagal simpan: ' + (e.message || 'Error server'), 'error');
  }
}

function applySettingsToForm() {
  const urlEl  = document.getElementById('script-url');
  const nameEl = document.getElementById('sheet-name');
  if (urlEl) {
    urlEl.value = '';
    urlEl.placeholder = 'https://script.google.com/macros/s/...';
  }
  if (nameEl && settings.sheetName) nameEl.value = normalizeMainSheetName(settings.sheetName);
}

// ─── Init ─────────────────────────────────────────────────
function initApp() {
  setTodayDate();
  updateTimestamp();
  setInterval(updateTimestamp, 1000);
  loadSettings();
  checkStatus();
  loadHistoryFromDB();
}

// ─── Database → UI ────────────────────────────────────────
async function loadData() {
  const db   = await initDB();
  const storedRows = await db.getAll('transaksi');
  storedRows.sort((a, b) => (b.id || 0) - (a.id || 0));

  let serverTxRows = [];
  let serverDebtRows = [];
  if (navigator.onLine && typeof apiGet === 'function') {
    try {
      const histRes = await apiGet('/history?scope=all');
      const refreshed = histRes && histRes.status === 'ok' ? histRes.data : null;
      const refreshedTxRows = Array.isArray(refreshed?.transactions) ? refreshed.transactions : [];
      const refreshedDebtRows = Array.isArray(refreshed?.debts) ? refreshed.debts : [];
      serverTxRows = refreshedTxRows.map(normalizeServerTransactionRow);
      serverDebtRows = refreshedDebtRows.map(row => normalizeServerDebtRow(row, row.recordType === 'piutang' ? 'Piutang' : 'Hutang'));
      serverDebtRows = serverDebtRows.filter(row => isCurrentMonthDate(row.tanggal));
    } catch (err) {
      console.warn('Gagal memuat histori server, fallback lokal:', err);
    }
  }

  const localTxRows = storedRows
    .filter(h => !h.recordType || h.recordType === 'transaksi')
    .map(item => ({ ...item, source: item.source || 'local', sortKey: item.id || 0 }));
  const localDebtRows = storedRows
    .filter(h => h.recordType === 'hutang' || h.recordType === 'piutang')
    .map(item => ({ ...item, source: item.source || 'local', sortKey: item.id || 0 }));

  localHistory = mergeRows(serverTxRows, localTxRows, buildTransactionKey);
  debtHistory = mergeRows(serverDebtRows, localDebtRows, buildDebtKey);
  updateHistoryMonthOptions(localHistory);
  renderHistory();
  renderDebtHistory();
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
  const debtDate = document.getElementById('tanggal-utang');
  if (debtDate) debtDate.value = new Date().toISOString().split('T')[0];
  const dueDate = document.getElementById('jatuh-tempo');
  if (dueDate && !dueDate.value) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    dueDate.value = d.toISOString().split('T')[0];
  }
}

// ─── Panels & Sidebar ─────────────────────────────────────
const PANEL_TITLES = {
  input:    'Input Transaksi',
  saldo:    'Saldo & Ringkasan',
  history:  'Riwayat Lokal',
  utang:    'Hutang & Piutang',
  settings: 'Pengaturan',
  about:    'Panduan',
};
const PANEL_ORDER = ['input', 'saldo', 'history', 'utang', 'settings', 'about'];

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
  if (name === 'utang' && !isAdmin()) {
    toast('Hanya Admin yang bisa melihat Hutang & Piutang', 'error');
    return;
  }

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-panel="${name}"]`);
  if (activeNav) {
    activeNav.classList.add('active');
  } else {
    const idx = PANEL_ORDER.indexOf(name);
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[idx]) navItems[idx].classList.add('active');
  }

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PANEL_TITLES[name] || '';

  closeSidebar();

  if (name === 'saldo' && typeof onSaldoPanelOpen === 'function') {
    onSaldoPanelOpen();
  }
  if (name === 'utang' && typeof onUtangPanelOpen === 'function') {
    onUtangPanelOpen();
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
    recordType:'transaksi',
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
    if (typeof upsertServerHistory === 'function') {
      await upsertServerHistory(data);
    }
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

function selectDebtType(val, el) {
  selectedDebtType = val;
  document.querySelectorAll('#utang-selector .jenis-btn').forEach(b => b.className = 'jenis-btn');
  const cls = val === 'Hutang' ? 'active-keluar' : 'active-masuk';
  el.classList.add(cls);
  updateDebtFormLabels();
}

function updateDebtFormLabels() {
  const subtitle = document.querySelector('#panel-utang .form-header p');
  const btn = document.querySelector('#btn-utang-submit .btn-text');
  const kontak = document.querySelector('label[for="pemberi-utang"]');
  if (subtitle) subtitle.textContent = `Input data ke sheet ${selectedDebtType}`;
  if (btn) btn.textContent = `Simpan ke Sheet ${selectedDebtType}`;
  if (kontak) kontak.textContent = selectedDebtType === 'Hutang' ? 'Pemberi Utang' : 'Pemberi Piutang';
}

function updateDebtNominalDisplay(inp) {
  const el = document.getElementById('nominal-utang-display');
  const val = parseFloat(inp.value);
  if (el) el.textContent = (!val || isNaN(val)) ? '' : formatRp(val);
}

async function submitDebtForm(e) {
  e.preventDefault();
  if (!isAdmin()) {
    toast('Hanya Admin yang bisa input Hutang/Piutang', 'error');
    return;
  }

  const btn = document.getElementById('btn-utang-submit');
  if (btn) btn.disabled = true;
  if (btn) btn.classList.add('loading');

  const type = selectedDebtType || 'Hutang';
  const nominal = parseFloat(document.getElementById('nominal-utang').value) || 0;
  const data = {
    id:        Date.now(),
    recordType:type === 'Hutang' ? 'hutang' : 'piutang',
    timestamp: new Date().toLocaleString('id-ID'),
    tanggal:   document.getElementById('tanggal-utang').value,
    jatuhTempo: document.getElementById('jatuh-tempo').value,
    deskripsi: document.getElementById('deskripsi-utang').value.trim(),
    pemberiUtang: document.getElementById('pemberi-utang').value.trim(),
    nominal:   nominal,
    status:    document.getElementById('status-utang').value,
    pengingat: document.getElementById('pengingat-utang').value,
    jenisUtang: document.getElementById('jenis-utang').value,
    sheetName: type,
    sent:      false,
  };

  try {
    const db = await initDB();
    await db.add('transaksi', data);
    if (typeof upsertServerHistory === 'function') {
      await upsertServerHistory(data);
    }
    await loadData();
    resetDebtForm();
    toast(`${type} tersimpan di lokal`, 'success');
    trySync();
  } catch (err) {
    toast('Gagal menyimpan lokal', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btn) btn.classList.remove('loading');
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

function resetDebtForm() {
  const fields = ['tanggal-utang', 'jatuh-tempo', 'nominal-utang', 'pemberi-utang', 'deskripsi-utang'];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const nomDisplay = document.getElementById('nominal-utang-display');
  if (nomDisplay) nomDisplay.textContent = '';
  const statusEl = document.getElementById('status-utang');
  if (statusEl) statusEl.value = 'Belum dibayar';
  const reminderEl = document.getElementById('pengingat-utang');
  if (reminderEl) reminderEl.value = 'BELUM';
  const jenisEl = document.getElementById('jenis-utang');
  if (jenisEl) jenisEl.value = 'Transaksi';
  selectedDebtType = 'Hutang';
  const hutangBtn = document.querySelector('#utang-selector .jenis-btn[data-val="Hutang"]');
  if (hutangBtn) selectDebtType('Hutang', hutangBtn);
  setTodayDate();
}

// ─── History ──────────────────────────────────────────────
function filterHistory(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

function filterHistorySource(filter, el) {
  currentSourceFilter = filter;
  document.querySelectorAll('[data-source-filter]').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

function filterHistoryMonth(value) {
  currentMonthFilter = value;
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-container');
  if (!container) return;

  const isAdminMode = typeof isAdmin === 'function' && isAdmin();
  const isUserMode  = typeof isUser  === 'function' && isUser();

  const transactionRows = localHistory.filter(h => !h.recordType || h.recordType === 'transaksi');
  const filtered = transactionRows.filter(h => {
    const jenisMatch = currentFilter === 'all' || h.jenis === currentFilter;
    const sourceMatch = currentSourceFilter === 'all'
      || (currentSourceFilter === 'server' && h.source === 'server')
      || (currentSourceFilter === 'local' && h.source !== 'server');
    const monthMatch = currentMonthFilter === 'all'
      || buildMonthKey(h.tanggal) === currentMonthFilter;
    return jenisMatch && sourceMatch && monthMatch;
  });

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
    if (h.source === 'server') {
      actionBtns = `<span class="btn-sent-tag">Tersinkron</span>`;
    } else if (isAdminMode || (!isAdminMode && !isUserMode)) {
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
          <div class="history-desc">${escapeHTML(h.deskripsi)}</div>
          <div class="history-meta">${escapeHTML(formatDateLabel(h.tanggal))} · Ditambahkan ${escapeHTML(formatAddedAt(h.timestamp))} · ${escapeHTML(h.kategori)}</div>
        </div>
        <div class="history-right" style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <div class="history-nominal ${nomCls}">${sign}${formatRp(h.nominal)}</div>
            <div class="history-sumber">${escapeHTML(h.sumber)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <span class="history-source-tag ${h.source === 'server' ? 'is-server' : 'is-local'}">${sourceLabel(h)}</span>
            ${actionBtns}
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

function filterDebtHistory(filter, el) {
  currentDebtFilter = filter;
  document.querySelectorAll('[data-debt-filter]').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderDebtHistory();
}

function filterDebtSourceHistory(filter, el) {
  currentDebtSourceFilter = filter;
  document.querySelectorAll('[data-debt-source-filter]').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderDebtHistory();
}

function renderDebtHistory() {
  const container = document.getElementById('utang-history-container');
  if (!container) return;

  const filtered = debtHistory.filter(h => {
    const typeMatch = currentDebtFilter === 'all' || (h.recordType || '') === currentDebtFilter.toLowerCase();
    const sourceMatch = currentDebtSourceFilter === 'all'
      || (currentDebtSourceFilter === 'server' && h.source === 'server')
      || (currentDebtSourceFilter === 'local' && h.source !== 'server');
    return typeMatch && sourceMatch;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="history-empty">
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px">Belum ada data</div>
        <p style="font-size:12px;color:var(--text3)">Data hutang/piutang akan muncul di sini</p>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="history-list">${filtered.map(h => {
    const typeLabel = h.recordType === 'piutang' ? 'Piutang' : 'Hutang';
    const statusCls = h.status === 'Sudah dibayar' ? 'dot-masuk' : 'dot-keluar';
    const nominalCls = h.recordType === 'piutang' ? 'masuk-color' : 'keluar-color';
    const sentLabel = h.sent ? 'Terkirim' : 'Pending';
    if (h.source === 'server') {
      return `
      <div class="history-item">
        <div class="history-dot ${statusCls}"></div>
        <div class="history-body">
          <div class="history-desc">${escapeHTML(h.deskripsi)}</div>
          <div class="history-meta">${escapeHTML(h.tanggal)} · Jatuh tempo ${escapeHTML(h.jatuhTempo || '-')}</div>
        </div>
        <div class="history-right" style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <div class="history-nominal ${nominalCls}">${formatRp(h.nominal || 0)}</div>
            <div class="history-sumber">${escapeHTML(h.pemberiUtang || '-')} · ${escapeHTML(typeLabel)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <span class="history-source-tag ${h.source === 'server' ? 'is-server' : 'is-local'}">${sourceLabel(h)}</span>
            <span class="btn-sent-tag">${escapeHTML(h.status || 'Belum dibayar')}</span>
            ${h.source === 'server' ? '<span class="btn-sent-tag">Tersinkron</span>' : `<span style="font-size:11px;color:var(--text3)">${sentLabel}</span>`}
          </div>
        </div>
      </div>`;
    }
    return `
      <div class="history-item">
        <div class="history-dot ${statusCls}"></div>
        <div class="history-body">
          <div class="history-desc">${escapeHTML(h.deskripsi)}</div>
          <div class="history-meta">${escapeHTML(h.tanggal)} · Jatuh tempo ${escapeHTML(h.jatuhTempo || '-')}</div>
        </div>
        <div class="history-right" style="display:flex;align-items:center;gap:10px">
          <div style="text-align:right">
            <div class="history-nominal ${nominalCls}">${formatRp(h.nominal || 0)}</div>
            <div class="history-sumber">${escapeHTML(h.pemberiUtang || '-')} · ${escapeHTML(typeLabel)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <span class="history-source-tag ${h.source === 'server' ? 'is-server' : 'is-local'}">${sourceLabel(h)}</span>
            <span class="btn-sent-tag">${escapeHTML(h.status || 'Belum dibayar')}</span>
            <span style="font-size:11px;color:var(--text3)">${sentLabel}</span>
            <button class="history-action-btn btn-delete" onclick="deleteItem(${h.id})" title="Hapus">Hapus</button>
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
async function refreshHistoryFromServer() {
  toast('Memuat histori dari server...', 'info');
  await loadData();
  toast('Histori diperbarui', 'success');
}

async function refreshDebtFromServer() {
  toast('Memuat hutang/piutang dari server...', 'info');
  await loadData();
  toast('Hutang/piutang diperbarui', 'success');
}

function renderStats() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const isUserMode = typeof isUser === 'function' && isUser();
  const transactionRows = localHistory.filter(h => !h.recordType || h.recordType === 'transaksi');

  const masuk  = transactionRows.filter(h => h.jenis === 'Masuk').reduce((a, b) => a + b.nominal, 0);
  const keluar = transactionRows.filter(h => h.jenis === 'Keluar').reduce((a, b) => a + b.nominal, 0);

  if (isUserMode) {
    // User mode: hide balance amounts
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Jumlah Transaksi</div>
        <div class="stat-val" style="color:var(--text)">${transactionRows.length}</div>
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
        <div class="stat-val" style="color:var(--text)">${transactionRows.length}</div>
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

function onUtangPanelOpen() {
  const activeBtn = document.querySelector('#utang-selector .jenis-btn[data-val="' + selectedDebtType + '"]');
  if (activeBtn) selectDebtType(selectedDebtType, activeBtn);
  updateDebtFormLabels();
  renderDebtHistory();
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

// ─── Export CSV ───────────────────────────────────────────
function exportCSV() {
  const transactionRows = localHistory.filter(h => !h.recordType || h.recordType === 'transaksi');
  if (!transactionRows.length) { toast('Tidak ada data transaksi', 'info'); return; }

  const rows = [
    ['Timestamp','Tanggal','Deskripsi','Kategori','Jenis','Nominal','Sumber','Kelompok','Status'],
    ...transactionRows.map(h => [
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
  const span   = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = msg;
  el.appendChild(span);
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
