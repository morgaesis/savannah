#!/bin/bash
# Build static site - copies and minifies for any static host
set -e
rm -rf dist
mkdir -p dist

# Minify engine.js via bun (if available) or copy as-is
if command -v bun &> /dev/null; then
  bun build public/engine.js --outfile dist/engine.js --minify 2>/dev/null || cp public/engine.js dist/
else
  cp public/engine.js dist/
fi

cp public/index.html dist/
cp public/favicon.svg dist/
cp public/og.png dist/

# Remove the SSE hot-reload script from index.html (not needed for static)
sed -i '/<script>/,/<\/script>/{ /EventSource/,/<\/script>/d }' dist/index.html
# Remove loading screen from static (loads fast enough)
# sed -i '/<div id="loading"/d' dist/index.html

ORIGINAL=$(wc -c < public/engine.js)
BUILT=$(wc -c < dist/engine.js)
echo "Built to dist/ ($(du -sh dist | cut -f1))"
echo "engine.js: ${ORIGINAL}B → ${BUILT}B ($(( (ORIGINAL - BUILT) * 100 / ORIGINAL ))% reduction)"
echo "Serve with: npx serve dist"
