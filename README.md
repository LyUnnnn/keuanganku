<div align="center">
  <h1>KeuanganKu</h1>
  <p><b>Aplikasi Pencatat Keuangan (PWA) dengan Arsitektur Offline-First & Google Sheets Backend.</b></p>

  <img src="https://img.shields.io/badge/PWA-Ready-success?style=flat-square&logo=pwa" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Database-Google_Sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white" alt="Google Sheets" />
</div>

<br />

KeuanganKu bukan sekadar form HTML biasa. Ini adalah aplikasi *Progressive Web App* (PWA) yang dibangun dengan arsitektur *software engineering* modern untuk menyelesaikan masalah pencatatan keuangan pribadi dengan cepat, aman, dan tanpa biaya server *database*.

## ✨ Fitur Utama

- **🔌 Offline-First:** Input transaksi kapan saja tanpa koneksi internet. Data diamankan di IndexedDB lokal dan otomatis dikirim saat koneksi kembali stabil.
- **🔐 Role-Based Authentication:** Sistem *login* menggunakan PIN dan JWT (JSON Web Tokens). Mendukung pemisahan peran antara **Admin** (akses penuh) dan **User** (hanya input data, saldo tersembunyi).
- **📊 Google Sheets Sync:** Integrasi dengan Google Spreadsheet melalui Apps Script untuk sinkronisasi data laporan.
- **📱 App-Like Experience:** UI yang responsif dan mendukung instalasi langsung ke layar utama (*home screen*) ponsel Anda.
- **⚡ Real-Time Dashboard:** Pantau total uang masuk, keluar, dan sisa saldo per sumber uang (BCA, Cash, OVO, dll) secara langsung.

## 🛠️ Tech Stack

**Frontend:**
- HTML5, CSS3, Vanilla JavaScript (No Frameworks)
- IndexedDB (Data lokal)
- Service Worker (Caching & Offline mode)

**Backend & DevOps:**
- Node.js & Express.js (Auth & Config API)
- Google Apps Script (REST API ke Spreadsheet)
- Docker & Docker Compose
- Nginx (Static file server & Reverse Proxy)

## 🏗️ Arsitektur Aplikasi

1. **Frontend statis** disajikan secara efisien oleh Nginx.
2. **Backend Node.js** berjalan di lingkungan tertutup Docker dan menangani autentikasi PIN, token JWT, serta penyimpanan konfigurasi.
3. Fitur **Sync Worker** di PWA mendeteksi status internet dan mengirim antrean transaksi ke endpoint Google Apps Script.

## 🚀 Cara Instalasi & Deployment

Pastikan Anda sudah menginstal Docker dan Docker Compose di server Anda.

**1. Clone Repository**
```bash
git clone https://github.com/LyUnnnn/keuanganku.git
cd keuanganku
