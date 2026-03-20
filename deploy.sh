#!/bin/bash
# Deploy latest code to africa-screensaver VM
set -e

VM_HOST="DEPLOY_HOST"
VM_PORT="$DEPLOY_PORT"
VM_USER="$DEPLOY_USER"
VM_PASS="REDACTED"
SSH="sshpass -p $VM_PASS ssh -o StrictHostKeyChecking=no -p $VM_PORT $VM_USER@$VM_HOST"
SCP="sshpass -p $VM_PASS scp -o StrictHostKeyChecking=no -P $VM_PORT"

export SSH_AUTH_SOCK=$SSH_AUTH_SOCK

echo "Syncing files..."
$SCP public/engine.js public/index.html $VM_USER@$VM_HOST:~/public/
$SCP src/server.ts $VM_USER@$VM_HOST:~/src/

echo "Fixing port..."
$SSH "sed -i 's/const PORT = 4680/const PORT = 80/' ~/src/server.ts"

echo "Restarting service..."
$SSH "echo '$VM_PASS' | sudo -S systemctl restart africa"

sleep 2
STATUS=$($SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost:80/")
echo "VM status: HTTP $STATUS"

if [ "$STATUS" = "200" ]; then
    echo "Deploy successful: http://africa.morgaes.is"
else
    echo "Deploy FAILED"
    $SSH "echo '$VM_PASS' | sudo -S journalctl -u africa --no-pager -n 10"
    exit 1
fi
