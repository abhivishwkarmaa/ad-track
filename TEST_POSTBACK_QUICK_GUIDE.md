# 🚀 Test Postback - Quick Reference Guide

## ⚡ Quick Start (3 Steps)

### 1️⃣ Navigate to Test Page
```
Dashboard → Publishers → Test Postback
```

### 2️⃣ Fill the Form
- **Tracking URL**: Paste affiliate's tracking URL
- **Publisher**: Select publisher (shows their postback URL)
- **Offer**: Select offer being tested
- **RCID** (optional): Custom tracking ID

### 3️⃣ Fire Test
- Click **"Fire Test"**
- New tab opens → complete redirect flow
- Return to see results (auto-updates every 2s)

---

## 📊 What Happens Behind the Scenes

```
USER CLICKS "FIRE TEST"
         ↓
Backend creates Redis session (15 min TTL)
  Key: test:postback:{tenant}:{publisher}:{offer}
         ↓
Browser opens tracking URL in new tab
         ↓
Affiliate redirects to YOUR /click endpoint
         ↓
/click detects test session in Redis
         ↓
Extracts affiliate's click_id from URL
         ↓
Fires postback IMMEDIATELY (no DB writes)
         ↓
Updates Redis: status = "completed"
         ↓
Returns normal redirect
         ↓
UI shows results: click_id + postback status
```

---

## ✅ What You Get

- ✅ **Real affiliate click_id** from URL
- ✅ **Real postback** fired to publisher endpoint
- ✅ **Zero DB pollution** (no test data in production)
- ✅ **Isolated testing** (won't affect live traffic)
- ✅ **Fast results** (Redis-based, instant)

---

## 🚫 What Does NOT Happen

- ❌ No writes to `clicks` table
- ❌ No writes to `conversions` table
- ❌ No impact on production analytics
- ❌ No cleanup needed (auto-expires in 15 min)

---

## 🔍 Redis Key Pattern

```
test:postback:{tenant_id}:{publisher_id}:{offer_id}
```

**Example**: `test:postback:1:42:789`

**Value**:
```json
{
  "status": "completed",
  "affiliate_click_id": "abc123",
  "postback_url": "https://affiliate.com/postback?click_id={click_id}",
  "postback_fired": true
}
```

**TTL**: 900 seconds (15 minutes)

---

## 🐛 Troubleshooting

### "Test timed out"
**Cause**: Click never reached `/click` endpoint  
**Fix**: Verify tracking URL redirects to your tracker

### "No postback URL configured"
**Cause**: Publisher has no `global_postback_url`  
**Fix**: Configure publisher's global postback URL in settings

### "Popup blocked"
**Cause**: Browser blocking `window.open()`  
**Fix**: Allow popups for this site in browser settings

### "Test session not found"
**Cause**: Session expired (15 min TTL)  
**Fix**: Start a new test

---

## 📝 Check Redis Manually

```bash
# Connect to Redis
redis-cli

# View test session
GET test:postback:1:42:789

# List all test sessions
KEYS test:postback:*

# Check TTL
TTL test:postback:1:42:789
```

---

## 🎯 Key Files

### Backend
- `/routes/testPostback.js` - API endpoints
- `/services/trackingService.js` - Click interception logic

### Frontend
- `/pages/Affiliate/PostbackTest.jsx` - UI and polling

---

## 📚 Full Documentation

- **Technical Details**: `BROWSER_BASED_TEST_POSTBACK.md`
- **Implementation Summary**: `TEST_POSTBACK_IMPLEMENTATION_SUMMARY.md`

---

## ✨ Pro Tips

1. **Use RCID**: Add custom tracking ID to identify your test clicks
2. **Check Logs**: Look for `[TEST]` prefix in backend logs
3. **Multiple Tests**: Can run multiple tests simultaneously (isolated by Redis key)
4. **Real Postback**: Actual HTTP request sent - check publisher's endpoint logs

---

**Status**: ✅ **READY FOR USE**  
**Version**: Redis-Driven (No DB Pollution)  
**Last Updated**: 2026-02-02
