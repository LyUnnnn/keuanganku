// ─── saldo.js — Panel Saldo Real-Time ────────────────────
// Membaca data dari Google Sheets via doGet Apps Script.
// Bergantung pada: ui.js (settings, toast, formatRp)
//
// PROTOKOL doGet yang diharapkan:
//   GET ?action=saldo&sheetName=Transaksi
//   Response JSON: { status:'ok', data:{ masuk, keluar, saldo, txnCount, perSumber:[{nama,masuk,keluar,saldo,txn}] } }

const SUMBER_EMOJI = {
  BCA: '🏦', Cash: '💵', OVO: '💜',
  Gopay: '💚', Dana: '🔵', Shopeepay: '🧡',
};

function getSumberEmoji(nama) {
  return SUMBER_EMOJI[nama] || '💳';
}

// ─── Fetch saldo dari Sheets ──────────────────────────────
async function fetchSaldoFromSheets() {
  if (!settings.scriptUrl) throw new Error('URL Apps Script belum diisi.');

  const url = new URL(settings.scriptUrl);
  url.searchParams.set('action', 'saldo');
  url.searchParams.set('sheetName', settings.sheetName || 'Transaksi');

  const res  = await fetch(url.toString(), { cache: 'no-store' });
  const json = await res.json();

  if (json.status !== 'ok') throw new Error(json.message || 'Respons tidak valid dari Sheets');
  return json.data;
}

// ─── Render fungsi ─────────────────────────────────────────
function renderSaldoHero(data) {
  const totalEl  = document.getElementById('saldo-total');
  const periodeEl = document.getElementById('saldo-periode');

  if (!totalEl) return;

  const saldo = data.saldo ?? 0;
  totalEl.textContent = formatRp(saldo);
  totalEl.className   = 'saldo-hero-amount' + (saldo >= 0 ? ' positive' : ' negative');
  periodeEl.textContent = `${data.txnCount ?? 0} transaksi di sheet "${settings.sheetName || 'Transaksi'}"`;
}

function renderSaldoSummary(data) {
  const masukEl       = document.getElementById('saldo-masuk');
  const keluarEl      = document.getElementById('saldo-keluar');
  const txnEl         = document.getElementById('saldo-txn-total');
  const masukCountEl  = document.getElementById('saldo-masuk-count');
  const keluarCountEl = document.getElementById('saldo-keluar-count');
  const sheetEl       = document.getElementById('saldo-sheet-name');

  if (!masukEl) return;

  masukEl.textContent       = formatRp(data.masuk   ?? 0);
  keluarEl.textContent      = formatRp(data.keluar  ?? 0);
  txnEl.textContent         = data.txnCount ?? 0;
  masukCountEl.textContent  = `${data.masukCount  ?? '—'} transaksi`;
  keluarCountEl.textContent = `${data.keluarCount ?? '—'} transaksi`;
  sheetEl.textContent       = settings.sheetName || 'Transaksi';
}

function renderSaldoPerSumber(perSumber) {
  const listEl = document.getElementById('saldo-sumber-list');
  if (!listEl) return;

  if (!perSumber || perSumber.length === 0) {
    listEl.innerHTML = `
      <div class="saldo-error">
        <div class="saldo-error-icon">📭</div>
        <p>Tidak ada data per sumber.</p>
      </div>`;
    return;
  }

  // Hitung max saldo absolut untuk skala progress bar
  const maxAbs = Math.max(...perSumber.map(s => Math.abs(s.saldo ?? 0)), 1);

  listEl.innerHTML = perSumber.map(s => {
    const saldo    = s.saldo   ?? 0;
    const masuk    = s.masuk   ?? 0;
    const keluar   = s.keluar  ?? 0;
    const txn      = s.txn     ?? 0;
    const pct      = Math.round(Math.abs(saldo) / maxAbs * 100);
    const barClass = saldo >= 0 ? 'bar-green' : 'bar-red';
    const amtClass = saldo >= 0 ? 'masuk-color' : 'keluar-color';
    const emoji    = getSumberEmoji(s.nama);

    return `
      <div class="saldo-sumber-row">
        <div class="saldo-sumber-icon">${emoji}</div>
        <div class="saldo-sumber-info">
          <div class="saldo-sumber-name">${s.nama}</div>
          <div class="saldo-sumber-txn">${txn} transaksi · +${formatRp(masuk)} / -${formatRp(keluar)}</div>
          <div class="saldo-bar-wrap">
            <div class="saldo-bar ${barClass}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="saldo-sumber-amount ${amtClass}">${formatRp(saldo)}</div>
      </div>`;
  }).join('');
}

function renderSaldoError(msg) {
  const listEl  = document.getElementById('saldo-sumber-list');
  const totalEl = document.getElementById('saldo-total');
  const periodeEl = document.getElementById('saldo-periode');

  if (totalEl)  totalEl.textContent  = '—';
  if (periodeEl) periodeEl.textContent = 'Gagal memuat data';
  if (listEl) {
    listEl.innerHTML = `
      <div class="saldo-error">
        <div class="saldo-error-icon">⚠️</div>
        <p>${msg}</p>
      </div>`;
  }
}

// ─── Aksi utama: Refresh Saldo ────────────────────────────
async function refreshSaldo() {
  const btn = document.getElementById('saldo-refresh-btn');

  if (!settings.scriptUrl) {
    toast('Isi URL Apps Script di Pengaturan terlebih dahulu!', 'error');
    showPanel('settings');
    return;
  }

  if (btn) btn.classList.add('loading');
  toast('⏳ Memuat saldo dari Sheets...', 'info');

  try {
    const data = await fetchSaldoFromSheets();

    renderSaldoHero(data);
    renderSaldoSummary(data);
    renderSaldoPerSumber(data.perSumber ?? []);

    // Tampilkan waktu update terakhir
    const updateEl = document.getElementById('saldo-last-update');
    if (updateEl) {
      updateEl.textContent = 'Diperbarui: ' + new Date().toLocaleString('id-ID', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit',
      });
    }

    toast('✅ Saldo berhasil dimuat', 'success');
  } catch (err) {
    console.error('refreshSaldo error:', err);
    renderSaldoError(err.message || 'Gagal terhubung ke Google Sheets.');
    toast('❌ ' + (err.message || 'Gagal memuat saldo'), 'error');
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

// Auto-refresh saat panel saldo dibuka
function onSaldoPanelOpen() {
  // Hanya auto-refresh jika ada URL & belum pernah dimuat hari ini
  if (!settings.scriptUrl) return;
  const lastUpdate = document.getElementById('saldo-last-update');
  if (lastUpdate && lastUpdate.textContent) return; // Sudah pernah dimuat
  refreshSaldo();
}
