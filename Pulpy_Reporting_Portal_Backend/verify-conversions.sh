#!/bin/bash

# Script to verify conversion storage in Redis after PM2 restart

echo "🔄 Step 1: Restarting PM2 processes..."
pm2 restart Pulpy postback-worker

echo ""
echo "⏳ Waiting 3 seconds for processes to start..."
sleep 3

echo ""
echo "🧪 Step 2: Testing postback endpoint..."
curl -s "http://localhost:5001/postback?click_id=WotKR6u7sSKUtuFhKqSqZuQdk-E_OSM6pZmb&amount=100" \
  -H "Host: abhi.localhost:5001" | jq .

echo ""
echo "⏳ Waiting 2 seconds for processing..."
sleep 2

echo ""
echo "🔍 Step 3: Checking Redis for conversion keys..."
node test-conversion-redis.js

echo ""
echo "✅ Verification complete!"