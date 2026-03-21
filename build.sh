#!/bin/bash
# Build static site - just copies the files needed for any static host
set -e
rm -rf dist
mkdir -p dist
cp public/engine.js dist/
cp public/index.html dist/
cp public/favicon.svg dist/

# Remove the SSE hot-reload script from index.html (not needed for static)
sed -i '/<script>/,/<\/script>/{ /EventSource/,/<\/script>/d }' dist/index.html

echo "Built to dist/ ($(du -sh dist | cut -f1))"
echo "Serve with: npx serve dist"
echo "Or upload dist/ to any static host (GitHub Pages, Cloudflare Pages, S3, etc.)"
