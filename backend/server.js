// ─── KeuanganKu Backend — server.js ──────────────────────
// Express API untuk autentikasi PIN & penyimpanan settings
// Data disimpan di /data/config.json (Docker volume)

const express  = require('express');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = 3001;

// ─── Path ke file konfigurasi (di Docker volume) ──────────
const DATA_DIR   = '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());

// CORS — hanya izinkan dari origin yang sama (Nginx)
app.use((req, res, next) => {
  // Dalam produksi Nginx, request datang dari localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Config helpers ───────────────────────────────────────
function readConfig() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_FILE)) return getDefaultConfig();
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return getDefaultConfig();
  }
}

function writeConfig(cfg) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
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
    initialized: false,
  };
}

// ─── Hash PIN (SHA-256 + salt tetap) ─────────────────────
const SALT = process.env.PIN_SALT || 'salt-default-sementara';
function hashPin(pin) {
  return crypto.createHash('sha256').update(SALT + pin).digest('hex');
}

// ─── JWT sederhana (tanpa library external) ───────────────
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

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
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ status: 'error', message: 'Token tidak valid atau expired' });
    if (roles.length && !roles.includes(payload.mode)) {
      return res.status(403).json({ status: 'error', message: 'Akses ditolak untuk mode ini' });
    }
    req.user = payload;
    next();
  };
}

// ═══════════════════════════════════════════════════════════
// ROUTES
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
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = verifyToken(token);
  const isAdmin = payload && payload.mode === 'admin';

  if (cfg.initialized && !isAdmin) {
    return res.status(403).json({ status: 'error', message: 'Sudah diinisialisasi. Gunakan endpoint change-pin.' });
  }

  cfg.pins.admin   = hashPin(adminPin);
  if (userPin) cfg.pins.user = hashPin(userPin);
  cfg.initialized  = true;
  writeConfig(cfg);

  res.json({ status: 'ok', message: 'PIN berhasil disimpan' });
});

// ─── POST /api/login — login dengan PIN ───────────────────
app.post('/api/login', (req, res) => {
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
    return res.status(401).json({ status: 'error', message: 'PIN salah' });
  }

  const token = signToken({ mode, version: 1 });
  res.json({ status: 'ok', token, mode });
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
  writeConfig(cfg);

  res.json({ status: 'ok', message: `PIN ${mode} berhasil diubah` });
});

// ─── GET /api/settings — ambil settings ───────────────────
app.get('/api/settings', requireAuth(), (req, res) => {
  const cfg = readConfig();
  res.json({ status: 'ok', data: cfg.settings });
});

// ─── POST /api/settings — simpan settings (admin only) ────
app.post('/api/settings', requireAuth(['admin']), (req, res) => {
  const { scriptUrl, sheetName } = req.body;

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
