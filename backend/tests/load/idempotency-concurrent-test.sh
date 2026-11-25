#!/bin/bash

set -euo pipefail

API="http://localhost:3001"
SENDER_EMAIL="concurrency.sender@test.local"
SENDER_PASSWORD="TestSender2026!"

SENDER_ACCOUNT="e8aae1c4-ba82-4a9c-a0b6-416f3cc8274c"
RECEIVER_ACCOUNT="e985bc7e-7f3f-40db-b383-0a1d2a7ed574"

KEY="idempotency-concurrent-$(date +%s)-$RANDOM"

TOKEN=$(curl -sS -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SENDER_EMAIL\",\"password\":\"$SENDER_PASSWORD\"}" \
  | jq -r '.token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: Login failed. No token received."
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

PAYLOAD=$(jq -n \
  --arg sender "$SENDER_ACCOUNT" \
  --arg receiver "$RECEIVER_ACCOUNT" \
  '{senderAccountId:$sender,receiverAccountId:$receiver,amount:10,currency:"SGD"}')

echo "======================================"
echo " CONCURRENT IDEMPOTENCY TEST"
echo "======================================"
echo "Requests: 2"
echo "Amount: SGD 10 each"
echo "Same idempotency key: $KEY"
echo "API: $API"
echo ""
echo "Launching both requests simultaneously..."

for i in 1 2; do
  (
    curl -sS -X POST "$API/api/transfers" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Idempotency-Key: $KEY" \
      -d "$PAYLOAD" \
      -o "$TMP_DIR/response-$i.json" \
      -w "%{http_code}" > "$TMP_DIR/status-$i.txt"
  ) &
done

wait

for i in 1 2; do
  echo ""
  echo "=== RESPONSE $i | HTTP $(cat "$TMP_DIR/status-$i.txt") ==="
  jq . "$TMP_DIR/response-$i.json"
done
