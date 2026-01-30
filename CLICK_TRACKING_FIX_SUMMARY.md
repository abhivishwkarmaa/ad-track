# Click Tracking Logic Fix Summary

## ✅ Changes Applied

### 1. Updated Click Lookup Logic (`src/services/postbackService.js`)
Modified the `processPostback` function to search for clicks using either `click_uuid` **OR** `tid` (Affiliate Click ID).

**Before:**
```javascript
const query = 'SELECT * FROM clicks WHERE click_uuid = ? AND tenant_id = ?';
```

**After:**
```javascript
const query = 'SELECT * FROM clicks WHERE (click_uuid = ? OR tid = ?) AND tenant_id = ?';
```
This ensures that if a postback comes in with the affiliate's ID (`tid`) instead of our internal UUID, we can still find the correct click record.

### 2. Verified Click Storage Logic (`src/services/trackingService.js`)
Confirmed that the tracker correctly extracts `click_id` from the incoming request and maps it to `tid`.

```javascript
// Confirmed line 342:
tid: query.tid || query.click_id || '', // Affiliate ID
```
This ensures the affiliate's ID is safely stored in the `tid` column.

### 3. Verified Postback Macro Logic (`src/services/postbackService.js`)
Confirmed that when firing a postback to the affiliate, the `{click_id}` macro is correctly replaced with the stored `tid`.

```javascript
// Confirmed line 809-813:
const affiliateClickId = click?.tid || '';
const url = replaceMacros(callbackUrl, {
  click_id: affiliateClickId, // Map standard click_id macro to affiliate's ID
  // ...
});
```

---

## 🎯 Goal Achieved
**"Affiliate click_id → stored as tid → used in conversions → used in postbacks"**

1.  **Ingestion**: `/click?click_id=AFF123` -> Stores `tid = AFF123`.
2.  **Conversion**: Postback `/postback?click_id=AFF123` -> Finds click via `tid`.
3.  **Postback**: Fires to affiliate with `?click_id=AFF123`.

The system now fully supports using the affiliate's `click_id` throughout the entire lifecycle.
