#!/bin/bash

# Ambil waktu saat ini (contoh: 1712061453)
TIMESTAMP=$(date +%s)

echo "🔄 Updating cache busting version to: $TIMESTAMP"

# Ganti semua parameter v=... di dalam index.html dengan timestamp baru
sed -i -E "s/v=[0-9\.]+/v=$TIMESTAMP/g" ./app/index.html

# Update semua inline styles dengan data attributes untuk init.js parsing
# (Ini buat CSS class yang akan di-apply via JavaScript)

echo "✅ Cache busting updated di app/index.html"
echo "📝 Next: Run \`npm run build\` or deployment command"