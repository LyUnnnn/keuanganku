#!/bin/bash

# Ambil waktu saat ini (contoh: 1712061453)
TIMESTAMP=$(date +%s)

# Ganti semua parameter v=... di dalam index.html dengan timestamp baru
sed -i -E "s/v=[0-9\.]+/v=$TIMESTAMP/g" ./app/index.html

echo "✅ Berhasil update cache busting di index.html ke versi: $TIMESTAMP"