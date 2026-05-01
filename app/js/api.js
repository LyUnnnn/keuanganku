// ─── api.js — Google Sheets Sync ─────────────────────────
// Bertanggung jawab mengirim data ke Apps Script.
// Bergantung pada: db.js (initDB), ui.js (settings, toast, loadData)

let isSyncing = false;

// Kirim satu item ke Google Sheets
async function sendItemToSheets(item, db) {
  const formData = new URLSearchParams();
  const requestedSheetName = item.sheetName || settings.sheetName || 'Transaksi';
  const isDebtItem = item.recordType === 'hutang' || item.recordType === 'piutang';
  const sheetName = isDebtItem
    ? (item.sheetName || (item.recordType === 'piutang' ? 'Piutang' : 'Hutang'))
    : (requestedSheetName === 'Hutang' || requestedSheetName === 'Piutang'
        ? 'Transaksi'
        : requestedSheetName);
  formData.append('sheetName', sheetName);
  if (isDebtItem) {
    [
      'timestamp',
      'tanggal',
      'jatuhTempo',
      'deskripsi',
      'pemberiUtang',
      'nominal',
      'status',
      'pengingat',
      'jenisUtang',
    ].forEach(key => {
      if (item[key] !== undefined && item[key] !== null) {
        formData.append(key, item[key]);
      }
    });
  } else {
    [
      'timestamp',
      'tanggal',
      'deskripsi',
      'kategori',
      'jenis',
      'nominal',
      'sumber',
      'kelompok',
    ].forEach(key => {
      if (item[key] !== undefined && item[key] !== null) {
        formData.append(key, item[key]);
      }
    });
  }

  // Better error detection with mode: 'cors'
  const response = await fetch(settings.scriptUrl, {
    method: 'POST',
    body: formData,
    mode: 'cors',
    credentials: 'omit', // Don't send cookies to untrusted endpoint
  });

  if (!response.ok && response.status !== 0) {
    // Status 0 happens with Google Script (CORS response handling)
    throw new Error(`Server responded with status ${response.status}`);
  }

  // Tandai terkirim & update DB
  item.sent = true;
  await db.put('transaksi', item);
}

// Sinkronisasi otomatis semua item yang belum terkirim
async function trySync() {
  if (isSyncing || !navigator.onLine || !settings.scriptUrl) return;
  isSyncing = true;

  try {
    const db      = await initDB();
    const allData = await db.getAll('transaksi');
    const pending = allData.filter(item => !item.sent);

    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        await sendItemToSheets(item, db);
      } catch (err) {
        console.warn('Gagal sync item, berhenti loop:', err);
        break; // Hentikan jika offline di tengah jalan
      }
    }

    await loadData(); // Refresh UI setelah sync
  } finally {
    isSyncing = false;
  }
}

// Kirim ulang satu item secara manual
async function manualSync(id) {
  if (!navigator.onLine)    { toast('Internet mati, gagal kirim!', 'error'); return; }
  if (!settings.scriptUrl)  { toast('Isi URL Apps Script di Pengaturan!', 'error'); return; }

  toast('📤 Mengirim data...', 'info');

  try {
    const db   = await initDB();
    const item = await db.get('transaksi', id);

    if (item && !item.sent) {
      await sendItemToSheets(item, db);
      await loadData();
      toast('✅ Berhasil dikirim', 'success');
    }
  } catch (err) {
    toast('❌ Gagal sinkron manual', 'error');
  }
}

// Trigger sync saat kembali online & setiap 60 detik
window.addEventListener('online', trySync);
setInterval(trySync, 60_000);
