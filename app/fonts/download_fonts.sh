#!/bin/bash
# Extract URLs from fonts.css and download each font file
grep -oP 'https://fonts\.gstatic\.com/[^)]+' fonts.css | sort -u | while read url; do
  filename=$(basename "$url")
  echo "Downloading: $filename"
  curl -s "$url" -o "$filename"
done
echo "All fonts downloaded"
