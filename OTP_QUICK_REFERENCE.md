# 🚀 OTP Quick Reference Card

## ✅ Status: PRODUCTION READY

---

## 📡 API Endpoints

### Send OTP
```bash
POST http://localhost:5001/api/contact/send-otp

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "message": "Your message (min 10 chars)"
}
```

### Verify OTP
```bash
POST http://localhost:5001/api/contact/verify-otp

{
  "email": "john@example.com",
  "otp": "123456"
}
```

---

## 🧪 Quick Test

```bash
# Run automated tests
./test-otp-implementation.sh

# Or test manually
curl -X POST http://localhost:5001/api/contact/send-otp \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","message":"Test message here"}'
```

---

## 🔑 Key Features

- ✅ 6-digit OTP codes
- ✅ 5-minute expiration
- ✅ 90-second rate limiting
- ✅ Max 3 verification attempts
- ✅ One-time use
- ✅ Email verification
- ✅ Redis storage
- ✅ Full logging

---

## 📧 Email Configuration

Already configured in `.env`:
- SMTP: smtpout.secureserver.net:587
- From: support@track-myads.com
- Admin: support@track-myads.com

---

## 🗄️ Redis Keys

- OTP Storage: `otp:contact:{email}` (5 min TTL)
- Rate Limit: `otp:ratelimit:{email}` (60 sec TTL)

---

## 📊 Test Results

| Test | Status |
|------|--------|
| OTP Generation | ✅ PASS |
| Rate Limiting | ✅ PASS |
| Redis Storage | ✅ PASS |
| Invalid OTP | ✅ PASS |
| Valid OTP | ✅ PASS |
| One-Time Use | ✅ PASS |

---

## 📝 Response Codes

- **200**: Success
- **400**: Validation error / Invalid OTP
- **429**: Rate limited
- **500**: Server error

---

## 🔍 Debug Commands

```bash
# Check Redis for OTP
redis-cli -h redis-15968.crce182.ap-south-1-1.ec2.cloud.redislabs.com \
  -p 15968 -a "n47r2Oe8B5B4qIoNm8EuufTFkCjgm4PQ" \
  GET "otp:contact:email@example.com"

# Check server health
curl http://localhost:5001/health

# View logs
pm2 logs
```

---

## 📚 Documentation

1. **OTP_IMPLEMENTATION_COMPLETE.md** - Full summary
2. **BACKEND_OTP_IMPLEMENTATION.md** - Implementation guide
3. **CONTACT_OTP_API_DOCS.md** - API reference
4. **test-otp-implementation.sh** - Test script

---

## 🎯 Files Modified

1. `src/controllers/contactController.js` - Added OTP methods
2. `src/services/emailService.js` - Added OTP email
3. `src/routes/contact.js` - Added OTP routes

---

## ⚡ Quick Tips

- OTP expires in 5 minutes
- Rate limit: 90 seconds between requests
- Max 3 verification attempts
- OTP deleted after successful verification
- Check spam folder for OTP emails

---

**Status**: ✅ LIVE & TESTED  
**Date**: Feb 4, 2026  
**Version**: 1.0.0
