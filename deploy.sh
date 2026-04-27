#!/bin/bash

# Cache busting: update v=TIMESTAMP di semua file HTML
# Jalankan script ini SEBELUM build/deploy

TIMESTAMP=$(date +%s)

echo "🔄 Cache busting version: $TIMESTAMP"

# Update v= parameters di index.html
sed -i -E "s/v=[0-9]+/v=$TIMESTAMP/g" ./app/index.html

# Optional: Log untuk verifikasi
echo "✅ Cache busting selesai!"
echo "📝 Perubahan di: app/index.html"
echo ""
echo "⚠️  PENTING: Jalankan script ini SEBELUM commit/deploy:"
echo "   ./deploy.sh && git add app/index.html"
echo ""
echo "💡 ATAU integrate ke CI/CD pipeline (GitHub Actions, GitLab CI, dll)"