# Test Postback Flow - Complete Diagram

## 🎯 Flow Overview

```
Frontend → Backend /start → Redis (Internal ID) → Tracking URL → Backend /click → Redis Match → Postback Fire
```

## 📋 Detailed Step-by-Step Flow

### Step 1: Frontend - User Selects Offer
```javascript
// PostbackTest.jsx (Line 315)
<option value={offer.public_offer_id || offer.id}>
  {offer.name} (Public ID: {offer.public_offer_id || offer.id})
</option>

// User sees: "Test Offer (Public ID: 3)"
// Form sends: offer_id = 3 (PUBLIC ID)
```

### Step 2: Frontend - Start Test Session
```javascript
// PostbackTest.jsx (Line 149-153)
const sessionResponse = await publishersAPI.startTestPostbackSession({
    affiliate_id: formData.affiliateId,      // e.g., 6
    offer_id: formData.offerId,              // e.g., 3 (PUBLIC ID)
    tracking_url: trackingUrl
});
```

### Step 3: Backend - /start Endpoint Receives Request
```javascript
// testPostback.js (Line 33-48)
const publicOfferId = parseInt(offer_id);  // 3 (PUBLIC ID from frontend)

// 🔥 RESOLVE: Public ID → Internal ID
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
// Returns: { id: 45, public_offer_id: 3, name: "Test Offer", ... }

const internalOfferId = offer.id;  // 45 (INTERNAL ID)

console.log('✅ Resolved Public Offer ID to Internal ID', {
    public_offer_id: 3,
    internal_offer_id: 45
});
```

### Step 4: Backend - Create Redis Key with Internal ID
```javascript
// testPostback.js (Line 64-65)
const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
console.log(key, "key");
// Output: "test:postback:1:6:45"
//                        ↑  ↑  ↑
//                        │  │  └─ Internal Offer ID (45)
//                        │  └──── Publisher ID (6)
//                        └─────── Tenant ID (1)

await redis.set(key, JSON.stringify(sessionData), 'EX', 900);
```

### Step 5: User Clicks Tracking URL
```
User clicks: https://track.example.com/click?offer_id=3&pub_id=6&click_id=abc123
                                                        ↑
                                                        PUBLIC ID (3)
```

### Step 6: Backend - /click Endpoint Receives Click
```javascript
// trackingService.js (Line 28)
const publicOfferId = parseInt(query.offer_id || query.oid);  // 3 (PUBLIC ID from URL)
```

### Step 7: Backend - Resolve Public ID to Internal ID (Again)
```javascript
// trackingService.js (Line 97)
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
// Returns: { id: 45, public_offer_id: 3, ... }

console.log('offer.id:', offer.id);  // 45 (INTERNAL ID)
```

### Step 8: Backend - Check for Test Session with Internal ID
```javascript
// trackingService.js (Line 556)
const key = `test:postback:${tenantId}:${publisher.id}:${offer.id}`;
// Constructs: "test:postback:1:6:45"
//                            ↑  ↑  ↑
//                            │  │  └─ Internal Offer ID (45) ✅ MATCHES!
//                            │  └──── Publisher ID (6)
//                            └─────── Tenant ID (1)

const sessionRaw = await redis.get(key);
// ✅ FOUND! Redis key matches because both use INTERNAL ID (45)
```

### Step 9: Backend - Extract Click ID and Fire Postback
```javascript
// trackingService.js (Line 581-608)
const affiliateClickId = query.click_id || query.tid;  // "abc123"

logger.info('[TEST] ✓ Affiliate click_id extracted', {
    affiliate_click_id: "abc123"
});

// Update Redis: status = 'click_received'
session.affiliate_click_id = affiliateClickId;
session.status = 'click_received';
await redis.set(key, JSON.stringify(session), 'KEEPTTL');

// 🔥 Fire Postback
await postbackService.sendPublisherPostback(callbackUrl, mockConversion, mockClick);

// Update Redis: status = 'completed'
session.status = 'completed';
await redis.set(key, JSON.stringify(session), 'KEEPTTL');
```

### Step 10: Frontend - Poll for Status
```javascript
// PostbackTest.jsx (Line 187-190)
const statusResponse = await publishersAPI.checkTestPostbackStatus(
    formData.affiliateId,     // 6
    formData.offerId,         // 3 (PUBLIC ID)
    { trackActivity: false }
);
```

### Step 11: Backend - /status Endpoint Resolves and Returns
```javascript
// testPostback.js (Line 121-144)
const publicOfferId = parseInt(offer_id);  // 3 (PUBLIC ID from query)

// 🔥 RESOLVE: Public ID → Internal ID (again)
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
const internalOfferId = offer.id;  // 45 (INTERNAL ID)

const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
// Constructs: "test:postback:1:6:45" ✅ MATCHES!

const data = await redis.get(key);
const session = JSON.parse(data);

// Return success with conversion details
return {
    success: true,
    status: 'success',  // Mapped from 'completed'
    result: { ... }
};
```

## 🔑 Key Points

### ✅ Public ID Usage:
- **Frontend**: Always uses and displays **public offer ID**
- **Tracking URLs**: Always contain **public offer ID** (external-facing)
- **User-facing**: All user interactions use **public offer ID**

### ✅ Internal ID Usage:
- **Redis Keys**: Always use **internal offer ID** (database primary key)
- **Database Operations**: Always use **internal offer ID**
- **Internal Logic**: All backend logic uses **internal offer ID**

### ✅ Resolution Points:
1. **`/start` endpoint**: Public ID → Internal ID (for Redis key creation)
2. **`/click` endpoint**: Public ID → Internal ID (for Redis key lookup)
3. **`/status` endpoint**: Public ID → Internal ID (for Redis key lookup)

### ✅ Why This Works:
- **Consistency**: All Redis keys use the same internal ID (45)
- **Isolation**: Each tenant/publisher/offer combination has a unique key
- **Matching**: `/start` creates key with internal ID, `/click` looks up with same internal ID
- **No Mismatch**: Public ID (3) is always resolved to same internal ID (45)

## 🎯 Redis Key Pattern

```
test:postback:{tenant_id}:{publisher_id}:{INTERNAL_offer_id}
              ↓           ↓               ↓
              1           6               45

✅ Created by: /start endpoint (after resolving public ID 3 → internal ID 45)
✅ Looked up by: /click endpoint (after resolving public ID 3 → internal ID 45)
✅ Looked up by: /status endpoint (after resolving public ID 3 → internal ID 45)
```

## 🚀 Success Criteria

- [x] Frontend sends public offer ID
- [x] Backend resolves public ID to internal ID at all entry points
- [x] Redis keys consistently use internal offer ID
- [x] Test session is found and postback fires
- [x] No ID mismatch issues
- [x] Clean separation between public (external) and internal (database) IDs
