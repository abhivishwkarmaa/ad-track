# Redis-Driven Test Postback Implementation (No DB Pollution)

## 🎯 Goal
Test postback functionality using **real browser clicks** that fire postbacks with the **affiliate's click_id**, while ensuring:
- ✅ **NO pollution** of production `clicks` or `conversions` tables
- ✅ **NO breaking** of existing production tracking flow
- ✅ **Isolated testing** per tenant + publisher + offer combination
- ✅ **Fast, reliable, and debuggable** test flow

## 🔄 Complete Flow

```
1. User enters Tracking URL + selects Publisher + Offer
   ↓
2. User clicks "Fire Test"
   ↓
3. Backend creates TEST SESSION in Redis (15 min TTL)
   Key: test:postback:{tenant_id}:{publisher_id}:{offer_id}
   Value: { status: "pending", affiliate_click_id: null, ... }
   ↓
4. Browser opens Affiliate Tracking URL in new tab
   ↓
5. Affiliate redirects → lands on OUR /click endpoint
   ↓
6. /click detects active TEST SESSION (tenant + publisher + offer match)
   ↓
7. Extract affiliate's click_id from URL (query.click_id or query.tid)
   ↓
8. Immediately fire GLOBAL POSTBACK using that click_id
   ↓
9. Mark test session SUCCESS in Redis
   ↓
10. Return normal redirect (NO DB writes to clicks/conversions)
   ↓
11. UI polls Redis → shows success with affiliate_click_id
```

## 🗂️ Redis Schema

### Key Pattern
```
test:postback:{tenant_id}:{publisher_id}:{offer_id}
```

### Value Structure
```json
{
  "status": "pending | click_received | completed",
  "affiliate_click_id": null,
  "started_at": 1700000000000,
  "completed_at": null,
  "postback_url": "https://affiliate.com/postback?click_id={click_id}",
  "postback_fired": false
}
```

### TTL
- **900 seconds** (15 minutes) - gives users time to complete the flow

## 🔧 Backend Implementation

### 1️⃣ Start Test Session
**Endpoint**: `POST /api/test-postback/start`

**Request**:
```json
{
  "affiliate_id": 123,
  "offer_id": 456,
  "tracking_url": "https://affiliate.com/track?..."
}
```

**Actions**:
- ✅ Validates publisher and offer exist
- ✅ Retrieves publisher's global postback URL
- ✅ Creates Redis session with `status: "pending"`
- ✅ Sets 900-second TTL
- ❌ **Does NOT** touch `clicks` or `conversions` tables

**Response**:
```json
{
  "success": true,
  "message": "Test started. Waiting for click...",
  "expires_in_seconds": 900
}
```

### 2️⃣ Click Interception
**Location**: `/services/trackingService.js` → `_processTestInterception()`

**Detection Logic**:
```javascript
const key = `test:postback:${tenantId}:${publisher.id}:${offer.id}`;
const session = await redis.get(key);

if (session && session.status === 'pending') {
  // TEST MODE ACTIVATED
}
```

**Actions When Test Session Detected**:
1. Extract affiliate's click_id: `query.click_id || query.tid`
2. Update Redis: `status = "click_received"`
3. Fire postback immediately using `postbackService.sendPublisherPostback()`
4. Update Redis: `status = "completed"`
5. Return redirect URL (normal flow)
6. ❌ **SKIP** all database writes to `clicks` and `conversions`

**Mock Conversion for Postback**:
```javascript
const mockConversion = {
  conversion_uuid: 'TEST-' + uuidv4(),
  click_uuid: 'TEST-CLICK-' + uuidv4(),
  offer_id: offer.id,
  publisher_id: publisher.id,
  tenant_id: tenantId,
  status: 'approved',
  amount: 0,
  payout: 0,
  is_test: true
};
const mockClick = { tid: affiliateClickId };
```

### 3️⃣ Status Polling
**Endpoint**: `GET /api/test-postback/status?affiliate_id=123&offer_id=456`

**Response States**:

**Pending**:
```json
{
  "success": true,
  "status": "pending",
  "message": "Waiting for click..."
}
```

**Processing**:
```json
{
  "success": true,
  "status": "processing",
  "message": "Click received, firing postback..."
}
```

**Success**:
```json
{
  "success": true,
  "status": "success",
  "result": {
    "click_id": "abc123",
    "affiliate_click_id": "abc123",
    "postback_fired": true,
    "conversion": {
      "status": "approved",
      "click_id": "abc123",
      "postback": {
        "url": "https://affiliate.com/postback?click_id=abc123",
        "status": 200,
        "response": "Fired via Redis Isolation"
      }
    }
  },
  "message": "Test postback fired successfully"
}
```

**Expired**:
```json
{
  "success": true,
  "status": "expired",
  "message": "Test timed out. No click received."
}
```

## 🎨 Frontend Implementation

### Key Features
1. **Required Fields**: Tracking URL, Publisher, Offer
2. **Optional Field**: RCID (appended as `tid` parameter)
3. **Browser Opening**: `window.open(trackingUrl, '_blank')`
4. **Polling**: Every 2 seconds for up to 60 seconds
5. **Status Display**: Real-time updates showing test progress

### User Experience
- User fills form and clicks "Fire Test"
- New tab opens with tracking URL
- User completes redirect flow in new tab
- Original tab polls for results
- Success message shows affiliate's click_id and postback details

## ✅ What This Achieves

### 🚫 No DB Pollution
- Test clicks **never** written to `clicks` table
- Test conversions **never** written to `conversions` table
- Production analytics remain clean

### 🔒 No Logic Breaking
- Production clicks continue normal flow
- Test detection is isolated to Redis key existence
- If Redis key doesn't exist → normal production flow

### 🎯 Accurate Testing
- Uses **real** affiliate click_id from URL
- Fires **real** postback to publisher's endpoint
- Tests **actual** redirect chain

### ⚡ Fast & Reliable
- Redis-based session (sub-millisecond lookups)
- 15-minute TTL (plenty of time for testing)
- Immediate postback firing (no queue delays)

## 📁 Files Modified

### Backend
1. **`/routes/testPostback.js`**
   - Start session endpoint
   - Status polling endpoint
   - 900-second TTL

2. **`/services/trackingService.js`**
   - `_processTestInterception()` method
   - Detects test sessions
   - Fires postback without DB writes

### Frontend
3. **`/pages/Affiliate/PostbackTest.jsx`**
   - Form with tracking URL, publisher, offer
   - Browser-based URL opening
   - Status polling and display

## 🧪 Testing Instructions

1. Navigate to **"Test Postback"** page
2. Enter a **tracking URL** (from affiliate/publisher)
3. Select the **Publisher** (to get postback URL)
4. Select the **Offer** (to match test session)
5. Optionally add **RCID** (custom tracking ID)
6. Click **"Fire Test"**
7. New tab opens → complete the redirect flow
8. Return to original tab → see results

## 🎉 Benefits

1. ✅ **Zero DB Pollution**: No test data in production tables
2. ✅ **Real Click Testing**: Uses actual affiliate click_id
3. ✅ **Isolated Sessions**: Per tenant + publisher + offer
4. ✅ **Fast Execution**: Redis-based, no DB queries
5. ✅ **Production Safe**: Doesn't break existing tracking
6. ✅ **Easy Debugging**: Clear Redis keys and status flow

## ⚠️ Important Notes

- **Popup Blocker**: Must be disabled for this site
- **Valid URL**: Tracking URL must be complete and valid
- **Session Scope**: Test is isolated to exact tenant + publisher + offer combo
- **No Persistence**: Test results expire after 15 minutes (Redis TTL)
- **Real Postback**: Actual HTTP request sent to publisher's endpoint
