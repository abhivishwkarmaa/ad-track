#!/bin/bash

# Test script for strict multi-tenant click tracking
# Usage: ./test-click-tracking.sh [tenant_slug] [offer_id] [pub_id]

TENANT_SLUG=${1:-"tenant1"}
OFFER_ID=${2:-"1"}
PUB_ID=${3:-"1"}
PORT=${4:-"5001"}

echo "=========================================="
echo "Testing Click Tracking with Tenant Subdomain"
echo "=========================================="
echo "Tenant: $TENANT_SLUG"
echo "Offer ID: $OFFER_ID"
echo "Publisher ID: $PUB_ID"
echo "Port: $PORT"
echo ""

# Test with tenant subdomain
echo "Testing: $TENANT_SLUG.localhost:$PORT/click?offer_id=$OFFER_ID&pub_id=$PUB_ID"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Host: $TENANT_SLUG.localhost:$PORT" \
  "http://localhost:$PORT/click?offer_id=$OFFER_ID&pub_id=$PUB_ID")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "Response:"
echo "$BODY" | head -5
echo ""
echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Click tracking successful (redirected)"
  echo ""
  echo "Checking if click was stored in Redis..."
  sleep 2
  
  # Check debug endpoint
  DEBUG_RESPONSE=$(curl -s "http://localhost:$PORT/debug/clicks")
  STREAM_LENGTH=$(echo "$DEBUG_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('stream_length', 0))" 2>/dev/null || echo "0")
  
  echo "Redis stream length: $STREAM_LENGTH"
  echo ""
  
  if [ "$STREAM_LENGTH" -gt 0 ]; then
    echo "✅ Click added to Redis stream"
    echo "Worker should process and insert into database shortly..."
  else
    echo "⚠️ Click not found in Redis stream (may have been processed already)"
  fi
else
  echo "❌ Click tracking failed"
  echo "Error: $BODY"
fi

echo ""
echo "=========================================="
