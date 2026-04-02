# KeuanganKu

Aplikasi Pencatat Keuangan (PWA) dengan Arsitektur Offline-First & Google Sheets Backend.

KeuanganKu bukan sekadar form HTML biasa. Ini adalah aplikasi *Progressive Web App* (PWA) yang dibangun dengan arsitektur *software engineering* modern untuk menyelesaikan masalah pencatatan keuangan pribadi dengan cepat, aman, dan tanpa biaya server *database*.

## ✨ Fitur Utama

- **🔌 Offline-First:** Input transaksi kapan saja tanpa koneksi internet. Data akan diamankan di IndexedDB lokal dan otomatis dikirim ke *server* saat koneksi kembali stabil.
- **🔐 Role-Based Authentication:** Sistem *login* menggunakan PIN dan JWT (JSON Web Tokens). Mendukung pemisahan peran antara **Admin** (akses penuh) dan **User** (hanya input data, saldo tersembunyi).
- **📊 Google Sheets as Database:** Integrasi langsung dengan Google Spreadsheet menggunakan Apps Script. Data laporan Anda tersusun rapi dan mudah diolah.
- **📱 App-Like Experience:** UI yang responsif dan mendukung instalasi langsung ke layar utama (*home screen*) ponsel Anda.
- **⚡ Real-Time Dashboard:** Pantau total uang masuk, keluar, dan sisa saldo per sumber uang (BCA, Cash, OVO, dll) secara langsung.

## 🛠️ Tech Stack

**Frontend:**
- HTML5, CSS3, Vanilla JavaScript (No Frameworks)
- IndexedDB (Data lokal)
- Service Worker (Caching & Offline mode)

**Backend & DevOps:**
- Node.js & Express.js (Auth & Config Server)
- Google Apps Script (REST API ke Spreadsheet)
- Docker & Docker Compose
- Nginx (Web Server & Reverse Proxy)

## 🏗️ Arsitektur Aplikasi

1. **Frontend statis** disajikan secara efisien oleh Nginx.
2. **Backend Node.js** berjalan di lingkungan tertutup Docker, menangani enkripsi PIN dan token JWT.
3. Fitur **Sync Worker** di PWA mendeteksi status internet dan mengirim antrean transaksi ke URL Google Apps Script.

## 🚀 Cara Instalasi & Deployment

Pastikan Anda sudah menginstal Docker dan Docker Compose di server Anda.

**1. Clone Repository**
```bash
git clone https://github.com/LyUnnnn/keuanganku.git
