# Test Postback Fix: Public vs Internal Offer ID Mismatch

## Problem Summary

The Test Postback feature was failing because of a mismatch between **public offer IDs** (used in tracking URLs) and **internal offer IDs** (database primary keys).

### Root Cause

The system uses two types of offer IDs:

1. **Public Offer ID** (`public_offer_id`): External-facing ID used in tracking URLs
   - Example: `offer_id=3` in `/click?offer_id=3&pub_id=6`
   - Stable across tenant lifecycle
   - What affiliates/publishers see

2. **Internal Offer ID** (`offers.id`): Database primary key
   - Example: `id=45` in the `offers` table
   - Used for all internal logic and Redis keys
   - Never exposed externally

### The Bug

**Before the fix:**

1. **Frontend** sends test request with `offer_id=3` (public ID from tracking URL)
2. **`/start` endpoint** treats `offer_id=3` as internal ID
   - Creates Redis key: `test:postback:1:6:3` ❌
3. **Click arrives** at `/click?offer_id=3&pub_id=6`
4. **`trackClick`** resolves public ID `3` → internal ID `45`
5. **`_processTestInterception`** looks for Redis key: `test:postback:1:6:45` ❌
6. **Result**: Keys don't match → Test session never found → Postback never fires

## Solution

Updated both `/start` and `/status` endpoints to:

1. **Accept public offer IDs** (as they appear in tracking URLs)
2. **Resolve to internal offer IDs** using `offerPublicIdService.getOfferByPublicId()`
3. **Create Redis keys using internal offer IDs**

### Changes Made

#### 1. `/start` Endpoint (`testPostback.js`)

**Before:**
```javascript
const offer = await offerService.getOfferById(offer_id, tenantId);
const key = `test:postback:${tenantId}:${affiliate_id}:${offer_id}`;
```

**After:**
```javascript
const publicOfferId = parseInt(offer_id);
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
const internalOfferId = offer.id;
const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
```

#### 2. `/status` Endpoint (`testPostback.js`)

**Before:**
```javascript
const key = `test:postback:${tenantId}:${affiliate_id}:${offer_id}`;
```

**After:**
```javascript
const publicOfferId = parseInt(offer_id);
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
const internalOfferId = offer.id;
const key = `test:postback:${tenantId}:${affiliate_id}:${internalOfferId}`;
```

#### 3. `trackClick` (Already Correct)

The `trackClick` method was already correctly resolving public IDs to internal IDs:

```javascript
const publicOfferId = parseInt(query.offer_id || query.oid);
const offer = await offerPublicIdService.getOfferByPublicId(publicOfferId, tenantId, null);
// Later uses offer.id (internal ID) for Redis key
```

## Flow After Fix

**Now the flow works correctly:**

1. **Frontend** sends test request with `offer_id=3` (public ID)
2. **`/start` endpoint**:
   - Receives `offer_id=3` (public ID)
   - Resolves to internal ID `45`
   - Creates Redis key: `test:postback:1:6:45` ✅
3. **Click arrives** at `/click?offer_id=3&pub_id=6`
4. **`trackClick`**:
   - Receives `offer_id=3` (public ID)
   - Resolves to internal ID `45`
5. **`_processTestInterception`**:
   - Looks for Redis key: `test:postback:1:6:45` ✅
   - **Match found!** ✅
6. **Result**: Test session found → Click ID extracted → Postback fired → Success! 🎉

## Key Principles Applied

1. **Tracking URLs always use public IDs** - External-facing, stable identifiers
2. **Internal logic always uses internal IDs** - Database primary keys for all Redis keys and business logic
3. **Translation happens at entry points** - Every endpoint that receives public IDs must resolve them immediately
4. **Consistency across the system** - All Redis keys use the same ID type (internal)

## Testing Checklist

- [ ] Start a test postback session
- [ ] Verify Redis key is created with internal offer ID
- [ ] Click the tracking URL (with public offer ID)
- [ ] Verify test session is found and updated
- [ ] Verify postback is fired
- [ ] Verify UI shows success status
- [ ] Test with multiple offers to ensure public/internal ID mapping works correctly

## Files Modified

1. `/Users/abhinavvishwakarma/work/JPL/Multi-Pulpy Final/Pulpy_Reporting_Portal_Backend/src/routes/testPostback.js`
   - Updated `/start` endpoint to resolve public → internal IDs
   - Updated `/status` endpoint to resolve public → internal IDs
   - Added logging for ID resolution

## No Changes Needed

- `trackingService.js` - Already correctly resolving public → internal IDs
- `offerPublicIdService.js` - Already providing the resolution mechanism
