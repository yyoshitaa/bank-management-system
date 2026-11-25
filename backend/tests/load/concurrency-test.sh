#!/bin/bash

set -euo pipefail

API="http://localhost:3001"
SENDER_EMAIL="concurrency.sender@test.local"
SENDER_PASSWORD="TestSender2026!"

SENDER_ACCOUNT="e8aae1c4-ba82-4a9c-a0b6-416f3cc8274c"
RECEIVER_ACCOUNT="e985bc7e-7f3f-40db-b383-0a1d2a7ed574"

# Authenticate the sender
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

RUN_ID="$(date +%s)-$RANDOM"

echo "======================================"
echo " CONCURRENCY TEST"
echo "======================================"
echo "Requests: 10"
echo "Amount: SGD 20 each"
echo "Total attempted: SGD 200"
echo "Available balance: SGD 100"
echo ""
echo "Launching requests simultaneously..."
echo ""

# Launch all 10 requests concurrently.
for i in $(seq 1 10); do
  (
    curl -sS -X POST "$API/api/transfers" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Idempotency-Key: concurrency-$RUN_ID-$i" \
      -d "{\"senderAccountId\":\"$SENDER_ACCOUNT\",\"receiverAccountId\":\"$RECEIVER_ACCOUNT\",\"amount\":20,\"currency\":\"SGD\"}" \
      -o "$TMP_DIR/response_$i.json" \
      -w "%{http_code}" > "$TMP_DIR/status_$i.txt"
  ) &
done

# Wait for all concurrent requests to finish.
wait

echo "======================================"
echo " RESULTS"
echo "======================================"

SUCCESS=0
FAILED=0

for i in $(seq 1 10); do
  STATUS=$(cat "$TMP_DIR/status_$i.txt")
  RESPONSE=$(cat "$TMP_DIR/response_$i.json")

  echo "Request $i | HTTP $STATUS | $RESPONSE"

  if [[ "$STATUS" == "201" ]]; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "======================================"
echo " SUMMARY"
echo "======================================"
echo "Successful transfers: $SUCCESS"
echo "Rejected transfers:  $FAILED"
echo "Total attempted:     10"
echo "Total attempted value: SGD 200"
echo "======================================"
