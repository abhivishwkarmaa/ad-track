# 🎨 Test Postback Flow - Visual Diagram

## 🔄 Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST POSTBACK SYSTEM                                 │
│                    (Redis-Driven, No DB Pollution)                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   FRONTEND   │
│   (Browser)  │
└──────┬───────┘
       │
       │ 1. User fills form:
       │    - Tracking URL
       │    - Publisher
       │    - Offer
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  POST /api/test-postback/start                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Backend validates:                                     │  │
│  │ ✓ Publisher exists                                     │  │
│  │ ✓ Offer exists                                         │  │
│  │ ✓ Publisher has global_postback_url                    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    REDIS     │
                    │              │
                    │  CREATE KEY: │
                    │  test:postback:{tenant}:{pub}:{offer}
                    │              │
                    │  VALUE:      │
                    │  {           │
                    │    status: "pending",
                    │    affiliate_click_id: null,
                    │    postback_url: "...",
                    │    started_at: 1706900000
                    │  }           │
                    │              │
                    │  TTL: 900s   │
                    └──────┬───────┘
                           │
                           │ 2. Session created
                           ▼
                    ┌──────────────┐
                    │   FRONTEND   │
                    │              │
                    │  window.open(trackingUrl, '_blank')
                    │              │
                    └──────┬───────┘
                           │
                           │ 3. New browser tab opens
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AFFILIATE'S TRACKING URL                      │
│  https://affiliate.com/track?offer_id=123&pub_id=456&click_id=abc123
│                                                                  │
│  Affiliate processes request and redirects to YOUR tracker      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ 4. Redirect to your /click endpoint
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GET /click?offer_id=123&pub_id=456&click_id=abc123             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ trackingService.trackClick()                              │  │
│  │   ↓                                                        │  │
│  │ _processTestInterception()                                │  │
│  │   ↓                                                        │  │
│  │ Check Redis for test session                              │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    REDIS     │
                    │              │
                    │  GET KEY:    │
                    │  test:postback:1:456:123
                    │              │
                    │  FOUND! ✓    │
                    │  status: "pending"
                    └──────┬───────┘
                           │
                           │ 5. Test session detected!
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  TEST MODE ACTIVATED                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Extract affiliate click_id from URL                    │  │
│  │    → incomingTid = query.click_id || query.tid            │  │
│  │    → "abc123"                                             │  │
│  │                                                            │  │
│  │ 2. Update Redis: status = "click_received"                │  │
│  │                                                            │  │
│  │ 3. Create mock conversion:                                │  │
│  │    {                                                       │  │
│  │      conversion_uuid: "TEST-xxx",                         │  │
│  │      offer_id: 123,                                       │  │
│  │      publisher_id: 456,                                   │  │
│  │      status: "approved",                                  │  │
│  │      amount: 0,                                           │  │
│  │      payout: 0,                                           │  │
│  │      is_test: true                                        │  │
│  │    }                                                       │  │
│  │                                                            │  │
│  │ 4. Fire postback IMMEDIATELY                              │  │
│  │    → postbackService.sendPublisherPostback()              │  │
│  │    → URL: https://affiliate.com/postback?click_id=abc123  │  │
│  │                                                            │  │
│  │ 5. Update Redis: status = "completed"                     │  │
│  │                                                            │  │
│  │ 6. Return redirect (SKIP DB WRITES)                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    REDIS     │
                    │              │
                    │  UPDATE KEY: │
                    │  {           │
                    │    status: "completed",
                    │    affiliate_click_id: "abc123",
                    │    postback_fired: true,
                    │    completed_at: 1706900015
                    │  }           │
                    └──────┬───────┘
                           │
                           │ 7. Postback fired!
                           ▼
                    ┌──────────────┐
                    │  PUBLISHER   │
                    │   ENDPOINT   │
                    │              │
                    │  Receives:   │
                    │  GET /postback?click_id=abc123&status=approved
                    │              │
                    │  Returns:    │
                    │  200 OK      │
                    └──────────────┘
                           │
                           │ 8. Meanwhile, browser continues...
                           ▼
                    ┌──────────────┐
                    │  ADVERTISER  │
                    │     URL      │
                    │              │
                    │  User lands  │
                    │  on offer    │
                    └──────────────┘
                           │
                           │ 9. Frontend polling...
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GET /api/test-postback/status?affiliate_id=456&offer_id=123    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Read Redis session                                        │  │
│  │ Status: "completed" ✓                                     │  │
│  │                                                            │  │
│  │ Return:                                                    │  │
│  │ {                                                          │  │
│  │   success: true,                                          │  │
│  │   status: "success",                                      │  │
│  │   result: {                                               │  │
│  │     click_id: "abc123",                                   │  │
│  │     affiliate_click_id: "abc123",                         │  │
│  │     postback_fired: true,                                 │  │
│  │     conversion: {                                         │  │
│  │       status: "approved",                                 │  │
│  │       postback: {                                         │  │
│  │         url: "https://affiliate.com/postback?...",        │  │
│  │         status: 200,                                      │  │
│  │         response: "OK"                                    │  │
│  │       }                                                    │  │
│  │     }                                                      │  │
│  │   }                                                        │  │
│  │ }                                                          │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ 10. Display results
                           ▼
                    ┌──────────────┐
                    │   FRONTEND   │
                    │              │
                    │  Shows:      │
                    │  ✓ Click ID: abc123
                    │  ✓ Postback URL
                    │  ✓ Status: 200 OK
                    │  ✓ Response: OK
                    │              │
                    │  🎉 SUCCESS! │
                    └──────────────┘


═══════════════════════════════════════════════════════════════════

                        KEY POINTS

═══════════════════════════════════════════════════════════════════

🚫 NO DATABASE WRITES
   ├─ clicks table: NOT TOUCHED
   ├─ conversions table: NOT TOUCHED
   └─ postback_logs table: NOT TOUCHED

✅ REDIS ONLY
   ├─ Session stored in Redis
   ├─ TTL: 900 seconds (15 minutes)
   └─ Auto-expires (no cleanup needed)

🎯 REAL TESTING
   ├─ Real browser redirect chain
   ├─ Real affiliate click_id
   └─ Real postback HTTP request

🔒 ISOLATED
   ├─ Scoped to: tenant + publisher + offer
   ├─ Multiple tests can run simultaneously
   └─ Zero impact on production traffic

⚡ FAST
   ├─ Redis lookups: < 1ms
   ├─ Immediate postback firing
   └─ No queue delays

═══════════════════════════════════════════════════════════════════
```

## 🔑 Redis Key Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    REDIS KEY LIFECYCLE                       │
└─────────────────────────────────────────────────────────────┘

TIME: 0s
┌────────────────────────────────────────┐
│ User clicks "Fire Test"                │
│                                        │
│ Redis Key Created:                     │
│ test:postback:1:456:123                │
│                                        │
│ Value:                                 │
│ {                                      │
│   status: "pending",                   │
│   affiliate_click_id: null,            │
│   postback_url: "...",                 │
│   postback_fired: false,               │
│   started_at: 1706900000               │
│ }                                      │
│                                        │
│ TTL: 900 seconds                       │
└────────────────────────────────────────┘

TIME: 5s
┌────────────────────────────────────────┐
│ Click reaches /click endpoint          │
│                                        │
│ Redis Key Updated:                     │
│ {                                      │
│   status: "click_received",            │
│   affiliate_click_id: "abc123",        │
│   ...                                  │
│ }                                      │
│                                        │
│ TTL: 895 seconds (preserved)           │
└────────────────────────────────────────┘

TIME: 6s
┌────────────────────────────────────────┐
│ Postback fired successfully            │
│                                        │
│ Redis Key Updated:                     │
│ {                                      │
│   status: "completed",                 │
│   affiliate_click_id: "abc123",        │
│   postback_fired: true,                │
│   completed_at: 1706900006,            │
│   ...                                  │
│ }                                      │
│                                        │
│ TTL: 894 seconds (preserved)           │
└────────────────────────────────────────┘

TIME: 900s (15 minutes)
┌────────────────────────────────────────┐
│ Redis Key EXPIRES                      │
│                                        │
│ Key: test:postback:1:456:123           │
│ Status: DELETED (auto-cleanup)         │
│                                        │
│ No manual cleanup needed! ✓            │
└────────────────────────────────────────┘
```

## 🆚 Production vs Test Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION CLICK FLOW                         │
└─────────────────────────────────────────────────────────────────┘

/click endpoint
    ↓
Check Redis for test session
    ↓
NOT FOUND → Continue normal flow
    ↓
Write to Redis hash (click data)
    ↓
Add to Redis stream
    ↓
Worker processes stream
    ↓
Write to clicks table ✓
    ↓
Conversion fires
    ↓
Write to conversions table ✓
    ↓
Postback fires
    ↓
Write to postback_logs table ✓


┌─────────────────────────────────────────────────────────────────┐
│                      TEST CLICK FLOW                             │
└─────────────────────────────────────────────────────────────────┘

/click endpoint
    ↓
Check Redis for test session
    ↓
FOUND! → Activate test mode
    ↓
Extract affiliate click_id
    ↓
Fire postback immediately
    ↓
Update Redis session
    ↓
Return redirect
    ↓
❌ SKIP all DB writes
    ↓
❌ NO clicks table write
❌ NO conversions table write
❌ NO postback_logs table write
    ↓
✅ Zero DB pollution!
```

---

**Last Updated**: 2026-02-02  
**Status**: ✅ Production Ready
