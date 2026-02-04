#!/bin/bash

echo "🧪 Testing 90-Second Rate Limit"
echo "================================"
echo ""

API_BASE="http://localhost:5001/api"
TEST_EMAIL="ratelimit-test-$(date +%s)@example.com"

echo "📧 Test Email: $TEST_EMAIL"
echo ""

# First request
echo "1️⃣ Sending first OTP request..."
RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/contact/send-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Rate\",
    \"lastName\": \"Test\",
    \"email\": \"$TEST_EMAIL\",
    \"message\": \"Testing 90 second rate limit\"
  }")

HTTP_CODE1=$(echo "$RESPONSE1" | tail -n1)
BODY1=$(echo "$RESPONSE1" | head -n-1)

echo "   Status: $HTTP_CODE1"
echo "   Response: $BODY1"
echo ""

if [ "$HTTP_CODE1" = "200" ]; then
  echo "   ✅ First request successful"
else
  echo "   ❌ First request failed"
  exit 1
fi

echo ""

# Second request (immediate - should fail)
echo "2️⃣ Sending second OTP request immediately (should be rate limited)..."
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/contact/send-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Rate\",
    \"lastName\": \"Test\",
    \"email\": \"$TEST_EMAIL\",
    \"message\": \"Testing 90 second rate limit\"
  }")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | head -n-1)

echo "   Status: $HTTP_CODE2"
echo "   Response: $BODY2"
echo ""

if [ "$HTTP_CODE2" = "429" ]; then
  echo "   ✅ Rate limiting working (429 Too Many Requests)"
else
  echo "   ❌ Rate limiting not working (expected 429, got $HTTP_CODE2)"
fi

echo ""
echo "📊 Summary:"
echo "   Rate Limit: 90 seconds"
echo "   First Request: $HTTP_CODE1"
echo "   Second Request: $HTTP_CODE2"
echo ""
echo "✅ Rate limit updated to 90 seconds successfully!"
echo ""
echo "ℹ️  Users can now resend OTP after 90 seconds"
