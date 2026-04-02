// ─── db.js — IndexedDB Layer ─────────────────────────────
// Satu-satunya file yang berbicara dengan IndexedDB.
// Ekspor: initDB()

const DB_NAME    = 'FinanceDB';
const DB_VERSION = 1;

async function initDB() {
  return idb.openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('transaksi')) {
        db.createObjectStore('transaksi', { keyPath: 'id' });
      }
    },
  });
}
