// ─── KeuanganKu Backend — server.js ──────────────────────
// Express API untuk autentikasi PIN & penyimpanan settings
// Data disimpan di /data/config.json (Docker volume)

const express  = require('express');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = 3001;
app.set('trust proxy', 1);

// ─── Path ke file konfigurasi (di Docker volume) ──────────
const DATA_DIR   = '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());

// ─── CORS — Strict origin whitelist ──────────────
function getCorsOrigin() {
  if (process.env.MY_DOMAIN) return `https://${process.env.MY_DOMAIN}`;
  // Development only
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost';
}

app.use((req, res, next) => {
  const allowedOrigin = getCorsOrigin();
  const origin = req.headers.origin;
  
  // Strict: only allow exact origin match
  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Config helpers ───────────────────────────────────────
function readConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_FILE)) return getDefaultConfig();
    return ensureConfigShape(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch {
    return getDefaultConfig();
  }
}

function writeConfig(cfg) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(ensureConfigShape(cfg), null, 2));
}

function getDefaultHistory() {
  return {
    transactions: [],
    debts: [],
  };
}

function ensureHistoryShape(data) {
  const base = getDefaultHistory();
  const store = data && typeof data === 'object' ? data : {};
  return {
    ...base,
    ...store,
    transactions: Array.isArray(store.transactions) ? store.transactions : [],
    debts: Array.isArray(store.debts) ? store.debts : [],
  };
}

function readHistoryStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(HISTORY_FILE)) return getDefaultHistory();
    return ensureHistoryShape(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')));
  } catch {
    return getDefaultHistory();
  }
}

function writeHistoryStore(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(ensureHistoryShape(store), null, 2));
}

function isDebtRecord(item) {
  return item && (item.recordType === 'hutang' || item.recordType === 'piutang');
}

function normalizeHistoryItem(item = {}) {
  const now = Date.now();
  const id = item.id != null ? item.id : now;
  const base = {
    id,
    sent: !!item.sent,
    source: item.source || 'local',
    createdAt: item.createdAt ? Number(item.createdAt) : now,
    updatedAt: now,
  };

  if (isDebtRecord(item)) {
    return {
      ...base,
      recordType: item.recordType,
      recordId: item.recordId || '',
      timestamp: item.timestamp || '',
      tanggal: item.tanggal || '',
      jatuhTempo: item.jatuhTempo || '',
      deskripsi: item.deskripsi || '',
      pemberiUtang: item.pemberiUtang || '',
      nominal: Number(item.nominal) || 0,
      status: item.status || 'Belum dibayar',
      pengingat: item.pengingat || 'BELUM',
      jenisUtang: item.jenisUtang || 'Transaksi',
      sheetName: item.sheetName || (item.recordType === 'piutang' ? 'Piutang' : 'Hutang'),
      sortKey: item.sortKey != null ? Number(item.sortKey) : id,
    };
  }

  return {
    ...base,
    recordType: 'transaksi',
    recordId: item.recordId || '',
    timestamp: item.timestamp || '',
    tanggal: item.tanggal || '',
    deskripsi: item.deskripsi || '',
    kategori: item.kategori || '',
    jenis: item.jenis || '',
    nominal: Number(item.nominal) || 0,
    sumber: item.sumber || '',
    kelompok: item.kelompok || '',
    transferId: item.transferId || '',
    transferLeg: item.transferLeg || '',
    transferSource: item.transferSource || '',
    transferTarget: item.transferTarget || '',
    sheetName: item.sheetName || 'Transaksi',
    sortKey: item.sortKey != null ? Number(item.sortKey) : id,
  };
}

function upsertHistoryItem(store, item) {
  const normalized = normalizeHistoryItem(item);
  const targetKey = isDebtRecord(normalized) ? 'debts' : 'transactions';
  const collection = Array.isArray(store[targetKey]) ? store[targetKey] : [];
  const idx = collection.findIndex(row => String(row.id) === String(normalized.id));
  if (idx >= 0) {
    collection[idx] = { ...collection[idx], ...normalized, updatedAt: Date.now() };
  } else {
    collection.push(normalized);
  }
  collection.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));
  store[targetKey] = collection;
  return normalized;
}

function getHistoryCollection(store, item) {
  return isDebtRecord(item) ? 'debts' : 'transactions';
}

function rowMatchesHistoryItem(row, item) {
  if (isDebtRecord(item)) {
    return String(row.id) === String(item.id)
      || (
        String(row.tanggal || '') === String(item.tanggal || '')
        && String(row.jatuhTempo || '') === String(item.jatuhTempo || '')
        && String(row.deskripsi || '') === String(item.deskripsi || '')
        && String(row.pemberiUtang || '') === String(item.pemberiUtang || '')
        && Number(row.nominal || 0) === Number(item.nominal || 0)
        && String(row.status || '') === String(item.status || '')
        && String(row.pengingat || '') === String(item.pengingat || '')
        && String(row.jenisUtang || '') === String(item.jenisUtang || '')
      );
  }

  return String(row.id) === String(item.id)
    || (
      String(row.recordId || '') === String(item.recordId || '')
      || (
      String(row.timestamp || '') === String(item.timestamp || '')
      && String(row.tanggal || '') === String(item.tanggal || '')
      && String(row.deskripsi || '') === String(item.deskripsi || '')
      && String(row.kategori || '') === String(item.kategori || '')
      && String(row.jenis || '') === String(item.jenis || '')
      && Number(row.nominal || 0) === Number(item.nominal || 0)
      && String(row.sumber || '') === String(item.sumber || '')
      && String(row.kelompok || '') === String(item.kelompok || '')
      && String(row.transferId || '') === String(item.transferId || '')
      && String(row.transferLeg || '') === String(item.transferLeg || '')
      )
    );
}

function removeHistoryItem(store, item) {
  const targetKey = getHistoryCollection(store, item);
  const collection = Array.isArray(store[targetKey]) ? store[targetKey] : [];
  const before = collection.length;
  store[targetKey] = collection.filter(row => !rowMatchesHistoryItem(row, item));
  return before - store[targetKey].length;
}

function getSyncConfig() {
  const cfg = readConfig();
  return cfg && cfg.settings ? cfg.settings : { scriptUrl: '' };
}

function getItemSheetName(item) {
  if (isDebtRecord(item)) {
    return item.sheetName || (item.recordType === 'piutang' ? 'Piutang' : 'Hutang');
  }
  return item.sheetName || 'Transaksi';
}

async function deleteHistoryRowFromSheets(item) {
  const settings = getSyncConfig();
  if (!item || !(item.sent || item.source === 'server')) return { skipped: true };
  if (!settings.scriptUrl) throw new Error('Settings scriptUrl belum tersedia');

  const formData = new URLSearchParams();
  formData.append('action', 'deleteHistory');
  formData.append('sheetName', getItemSheetName(item));

  if (isDebtRecord(item)) {
    ['recordId', 'timestamp', 'tanggal', 'jatuhTempo', 'deskripsi', 'pemberiUtang', 'nominal', 'status', 'pengingat', 'jenisUtang']
      .forEach(key => {
        if (item[key] !== undefined && item[key] !== null) {
          formData.append(key, item[key]);
        }
      });
  } else {
    ['recordId', 'timestamp', 'tanggal', 'deskripsi', 'kategori', 'jenis', 'nominal', 'sumber', 'kelompok', 'transferId', 'transferLeg']
      .forEach(key => {
        if (item[key] !== undefined && item[key] !== null) {
          formData.append(key, item[key]);
        }
      });
  }

  const response = await fetch(settings.scriptUrl, {
    method: 'POST',
    body: formData,
    mode: 'cors',
    credentials: 'omit',
  });
  if (!response.ok && response.status !== 0) {
    throw new Error(`Delete request failed: ${response.status}`);
  }

  return { skipped: false };
}

function ensureConfigShape(cfg) {
  const base = getDefaultConfig();
  return {
    ...base,
    ...cfg,
    pins: { ...base.pins, ...(cfg?.pins || {}) },
    settings: { ...base.settings, ...(cfg?.settings || {}) },
    auth: { ...base.auth, ...(cfg?.auth || {}) },
  };
}

function getDefaultConfig() {
  return {
    pins: {
      admin: null,  // SHA-256 hash of PIN
      user:  null,
    },
    settings: {
      scriptUrl: '',
      sheetName: 'Transaksi',
    },
    auth: {
      tokenVersion: 0,
    },
    initialized: false,
  };
}

// ─── Hash PIN (SHA-256 + salt tetap) ─────────────────────
const SALT = process.env.PIN_SALT || 'salt-default-sementara';
function hashPin(pin) {
  return crypto.createHash('sha256').update(SALT + pin).digest('hex');
}

// ─── JWT sederhana (tanpa library external) ───────────────
const JWT_TTL_MS = 24 * 60 * 60 * 1000;
const JWT_SECRET_FILE = path.join(DATA_DIR, 'jwt.secret');

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const secret = fs.readFileSync(JWT_SECRET_FILE, 'utf8').trim();
      if (secret) return secret;
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const JWT_SECRET = getJwtSecret();

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, part) => {
    const chunk = part.trim();
    if (!chunk) return acc;
    const idx = chunk.indexOf('=');
    const key = idx >= 0 ? chunk.slice(0, idx) : chunk;
    const value = idx >= 0 ? chunk.slice(idx + 1) : '';
    acc[decodeURIComponent(key)] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function isSecureRequest(req) {
  if (req.secure) return true;
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto === 'https';
}

function cookieOptions(req, maxAge = JWT_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecureRequest(req),
    path: '/',
    maxAge,
  };
}

function setAuthCookie(req, res, token) {
  res.cookie('keuanganku_token', token, cookieOptions(req));
}

function clearAuthCookie(req, res) {
  res.cookie('keuanganku_token', '', cookieOptions(req, 0));
}

function clearLegacyCookies(req, res) {
  res.cookie('keuanganku_csrf', '', cookieOptions(req, 0));
}

function signToken(payload) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    // Cek expire: 24 jam
    if (Date.now() - payload.iat > 24 * 60 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Middleware: verifikasi token ─────────────────────────
function requireAuth(roles = []) {
  return (req, res, next) => {
    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice(7)
      : (parseCookies(req.headers.cookie || '').keuanganku_token || '');
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ status: 'error', message: 'Token tidak valid atau expired' });
    const cfg = readConfig();
    if (Number(payload.version || 0) !== getAuthTokenVersion(cfg)) {
      return res.status(401).json({ status: 'error', message: 'Token tidak valid atau expired' });
    }
    if (roles.length && !roles.includes(payload.mode)) {
      return res.status(403).json({ status: 'error', message: 'Akses ditolak untuk mode ini' });
    }
    req.user = payload;
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// ROUTES

const authAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const SETUP_MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const AUTH_DELAY_STEP_MS = 300;

function authKey(req, scope) {
  return `${scope}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

function getAuthState(req, scope) {
  const key = authKey(req, scope);
  const now = Date.now();
  const state = authAttempts.get(key) || { fails: 0, lockedUntil: 0, lastFailAt: 0 };
  if (state.lockedUntil && state.lockedUntil <= now) {
    state.fails = 0;
    state.lockedUntil = 0;
  }
  authAttempts.set(key, state);
  return { key, state };
}

function clearAuthFailures(req, scope) {
  authAttempts.delete(authKey(req, scope));
}

function registerAuthFailure(req, scope, limit) {
  const { key, state } = getAuthState(req, scope);
  state.fails += 1;
  state.lastFailAt = Date.now();
  if (state.fails >= limit) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  authAttempts.set(key, state);
  return state;
}

function authDelay(state) {
  return Math.min(2000, state.fails * AUTH_DELAY_STEP_MS);
}

function authFailureResponse(res, state, message) {
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    const remaining = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const waitText = minutes > 0
      ? `${minutes} menit${seconds > 0 ? ` ${seconds} detik` : ''}`
      : `${remaining} detik`;
    return res.status(429).json({
      status: 'error',
      message: `Terlalu banyak percobaan. Coba lagi dalam ${waitText}.`,
      locked: true,
    });
  }
  return res.status(401).json({ status: 'error', message });
}

function getAuthTokenVersion(cfg) {
  return Number(cfg?.auth?.tokenVersion || 0);
}

function bumpAuthTokenVersion(cfg) {
  const next = {
    ...ensureConfigShape(cfg),
    auth: {
      tokenVersion: getAuthTokenVersion(cfg) + 1,
    },
  };
  writeConfig(next);
  return next.auth.tokenVersion;
}
// ═══════════════════════════════════════════════════════════

// ─── GET /api/status — cek apakah PIN sudah di-setup ──────
app.get('/api/status', (req, res) => {
  const cfg = readConfig();
  res.json({
    status: 'ok',
    initialized: cfg.initialized,
    adminPinSet: !!cfg.pins.admin,
    userPinSet:  !!cfg.pins.user,
  });
});

// ─── POST /api/setup — setup PIN pertama kali ─────────────
app.post('/api/setup', (req, res) => {
  const { adminPin, userPin } = req.body;

  if (!adminPin || !/^\d{4}$/.test(adminPin)) {
    return res.status(400).json({ status: 'error', message: 'PIN Admin harus 4 digit angka' });
  }
  if (userPin && !/^\d{4}$/.test(userPin)) {
    return res.status(400).json({ status: 'error', message: 'PIN User harus 4 digit angka' });
  }

  const cfg = readConfig();

  // Setup hanya bisa dilakukan sekali (jika belum initialized)
  // Atau dengan token admin yang valid
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (parseCookies(req.headers.cookie || '').keuanganku_token || '');
  const payload = verifyToken(token);
  const isAdmin = payload && payload.mode === 'admin';

  if (cfg.initialized && !isAdmin) {
    return res.status(403).json({ status: 'error', message: 'Sudah diinisialisasi. Gunakan endpoint change-pin.' });
  }

  cfg.pins.admin   = hashPin(adminPin);
  if (userPin) cfg.pins.user = hashPin(userPin);
  cfg.initialized  = true;
  bumpAuthTokenVersion(cfg);

  res.json({ status: 'ok', message: 'PIN berhasil disimpan' });
});

// ─── POST /api/login — login dengan PIN ───────────────────
app.post('/api/login', async (req, res) => {
  const { pin, mode } = req.body;

  if (!pin || !mode || !['admin', 'user'].includes(mode)) {
    return res.status(400).json({ status: 'error', message: 'Request tidak valid' });
  }

  const cfg = readConfig();

  if (!cfg.initialized) {
    return res.status(403).json({ status: 'error', message: 'Aplikasi belum di-setup', needSetup: true });
  }

  const stored = mode === 'admin' ? cfg.pins.admin : cfg.pins.user;

  if (!stored) {
    return res.status(403).json({ status: 'error', message: `PIN ${mode} belum di-setup` });
  }

  if (hashPin(pin) !== stored) {
    const state = registerAuthFailure(req, `login:${mode}`, LOGIN_MAX_ATTEMPTS);
    const delay = authDelay(state);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return authFailureResponse(res, state, 'PIN salah');
  }

  clearAuthFailures(req, `login:${mode}`);
  const token = signToken({ mode, version: getAuthTokenVersion(cfg) });
  setAuthCookie(req, res, token);
  clearLegacyCookies(req, res);
  res.json({ status: 'ok', mode });
});

// ─── POST /api/change-pin — ganti PIN (admin only) ────────
app.post('/api/change-pin', requireAuth(['admin']), (req, res) => {
  const { mode, newPin } = req.body;

  if (!newPin || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ status: 'error', message: 'PIN harus 4 digit angka' });
  }
  if (!['admin', 'user'].includes(mode)) {
    return res.status(400).json({ status: 'error', message: 'Mode tidak valid' });
  }

  const cfg = readConfig();
  cfg.pins[mode] = hashPin(newPin);
  bumpAuthTokenVersion(cfg);

  res.json({ status: 'ok', message: `PIN ${mode} berhasil diubah` });
});

// â”€â”€â”€ POST /api/logout â€” hapus cookie autentikasi â”€â”€â”€â”€â”€â”€
app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (parseCookies(req.headers.cookie || '').keuanganku_token || '');
  const payload = verifyToken(token);

  if (payload) {
    const cfg = readConfig();
    if (Number(payload.version || 0) === getAuthTokenVersion(cfg)) {
      bumpAuthTokenVersion(cfg);
    }
  }

  clearAuthCookie(req, res);
  clearLegacyCookies(req, res);
  res.json({ status: 'ok', message: 'Logout berhasil' });
});

// ─── GET /api/settings — ambil settings ───────────────────
app.get('/api/settings', requireAuth(), (req, res) => {
  const cfg = readConfig();
  res.json({ status: 'ok', data: cfg.settings });
});

// ─── URL Validation Helper ────────────────────────────────
app.get('/api/history', requireAuth(), (req, res) => {
  const scope = String(req.query.scope || 'all').toLowerCase();
  const store = readHistoryStore();

  if (scope === 'transactions') {
    return res.json({ status: 'ok', data: store.transactions });
  }
  if (scope === 'debts') {
    return res.json({ status: 'ok', data: store.debts });
  }
  return res.json({ status: 'ok', data: store });
});

app.post('/api/history', requireAuth(), (req, res) => {
  const item = req.body && (req.body.item || req.body);
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ status: 'error', message: 'Payload histori tidak valid' });
  }

  const store = readHistoryStore();
  const normalized = upsertHistoryItem(store, item);
  writeHistoryStore(store);

  res.json({ status: 'ok', data: normalized });
});

app.post('/api/history/delete', requireAuth(['admin']), async (req, res) => {
  const item = req.body && (req.body.item || req.body);
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ status: 'error', message: 'Payload hapus histori tidak valid' });
  }

  try {
    if (item.sent || item.source === 'server') {
      await deleteHistoryRowFromSheets(item);
    }

    const store = readHistoryStore();
    const removed = removeHistoryItem(store, item);
    writeHistoryStore(store);

    return res.json({ status: 'ok', removed });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.toString() });
  }
});

function isValidGoogleAppsScriptUrl(url) {
  if (!url) return true; // Empty is OK (not required)
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== 'https:') return false;
    if (urlObj.hostname !== 'script.google.com') return false;
    return /^\/macros\/(s|d)\/[a-zA-Z0-9_-]+\/(exec|useweb)\/?$/.test(urlObj.pathname);
  } catch {
    return false;
  }
}

// ─── POST /api/settings — simpan settings (admin only) ────
app.post('/api/settings', requireAuth(['admin']), (req, res) => {
  const { scriptUrl, sheetName } = req.body;

  // Validate Google Apps Script URL
  if (scriptUrl !== undefined && scriptUrl && !isValidGoogleAppsScriptUrl(scriptUrl)) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'URL harus Apps Script Google yang valid (https://script.google.com/macros/s/[ID]/exec atau /macros/d/[ID]/useweb). URL lainnya tidak diizinkan.' 
    });
  }

  const cfg = readConfig();
  if (scriptUrl !== undefined) cfg.settings.scriptUrl = scriptUrl;
  if (sheetName !== undefined) cfg.settings.sheetName = sheetName || 'Transaksi';
  writeConfig(cfg);

  res.json({ status: 'ok', message: 'Settings disimpan', data: cfg.settings });
});

// ─── GET /api/verify — cek token masih valid ──────────────
app.get('/api/verify', requireAuth(), (req, res) => {
  res.json({ status: 'ok', mode: req.user.mode });
});

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`KeuanganKu API berjalan di port ${PORT}`);
  console.log(`Config file: ${CONFIG_FILE}`);
  const cfg = readConfig();
  console.log(`Status: ${cfg.initialized ? 'sudah diinisialisasi' : 'belum setup PIN'}`);
});
