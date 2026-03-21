#!/bin/bash
# Deploy latest code to africa-screensaver VM
# Requires: DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER, DEPLOY_PASS env vars
# Or set them in .env (gitignored)
set -e

[ -f .env ] && source .env

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_PORT:=22}"
: "${DEPLOY_USER:=ubuntu}"
: "${DEPLOY_PASS:?Set DEPLOY_PASS}"

SSH="sshpass -p $DEPLOY_PASS ssh -o StrictHostKeyChecking=no -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST"
SCP="sshpass -p $DEPLOY_PASS scp -o StrictHostKeyChecking=no -P $DEPLOY_PORT"

echo "Syncing files..."
$SCP public/engine.js public/index.html public/favicon.svg $DEPLOY_USER@$DEPLOY_HOST:~/public/
$SCP src/server.ts $DEPLOY_USER@$DEPLOY_HOST:~/src/

echo "Ensuring port 4680 (traefik proxies 80/443 -> 4680)..."
$SSH "sed -i 's/const PORT = 80/const PORT = 4680/' ~/src/server.ts 2>/dev/null; grep 'const PORT' ~/src/server.ts"

echo "Restarting service..."
$SSH "echo '$DEPLOY_PASS' | sudo -S systemctl restart africa"

sleep 2
STATUS=$($SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:4680/")
echo "VM status: HTTP $STATUS"

if [ "$STATUS" = "200" ]; then
    echo "Deploy successful: https://africa.morgaes.is"
else
    echo "Deploy FAILED"
    $SSH "echo '$DEPLOY_PASS' | sudo -S journalctl -u africa --no-pager -n 10"
    exit 1
fi
