# ✅ FIX: Tracking URLs Now Use Public Offer ID

## Problem
When clicking "Show Tracking URL" in the frontend, the generated URL was using the internal database `offer_id` instead of the stable `public_offer_id`.

## Root Cause
The tracking URL generation in `assignmentService.generateTrackingURL()` was using `assignment.offer_id` (internal database ID) directly without fetching the offer's `public_offer_id`.

## Solution Applied

### File Modified: `src/services/assignmentService.js`

**Before**:
```javascript
async generateTrackingURL(assignmentId, baseURL, format = 'standard') {
  const assignment = await this.findById(assignmentId);
  if (!assignment) {
    return null;
  }

  // ... code ...

  return generateTrackingURL(
    baseURL,
    assignment.offer_id,  // ❌ Using internal database ID
    assignment.publisher_id,
    { click_id: '{click_id}' }
  );
}
```

**After**:
```javascript
async generateTrackingURL(assignmentId, baseURL, format = 'standard') {
  const assignment = await this.findById(assignmentId);
  if (!assignment) {
    return null;
  }

  // 🔥 CRITICAL: Fetch offer to get public_offer_id for tracking URL
  const offer = await offerService.getOfferById(assignment.offer_id, assignment.tenant_id || null);
  if (!offer) {
    logger.error('Offer not found for assignment', {
      assignment_id: assignmentId,
      offer_id: assignment.offer_id,
      tenant_id: assignment.tenant_id
    });
    return null;
  }

  // 🔥 CRITICAL: Use public_offer_id in tracking URLs (not internal database ID)
  const publicOfferId = offer.public_offer_id;
  if (!publicOfferId) {
    logger.error('Offer missing public_offer_id', {
      offer_id: offer.id,
      offer_name: offer.name,
      tenant_id: offer.tenant_id
    });
    return null;
  }

  // ... code ...

  return generateTrackingURL(
    baseURL,
    publicOfferId,  // ✅ Using stable public_offer_id
    assignment.publisher_id,
    { click_id: '{click_id}' }
  );
}
```

## Changes Made

1. **Fetch Offer**: Added code to fetch the full offer object using `offerService.getOfferById()`
2. **Extract Public ID**: Extract `public_offer_id` from the offer
3. **Validation**: Added error handling if offer or public_offer_id is missing
4. **Use Public ID**: Pass `publicOfferId` to `generateTrackingURL()` instead of `assignment.offer_id`
5. **Both Formats**: Applied fix to both standard and alternative tracking URL formats

## Example

### Before Fix:
```
https://tenant.track-myads.com/click?offer_id=4&pub_id=5&click_id={click_id}
                                                    ↑
                                          Internal database ID
```

### After Fix:
```
https://tenant.track-myads.com/click?offer_id=1&pub_id=5&click_id={click_id}
                                                    ↑
                                          Stable public_offer_id
```

## Benefits

✅ **Tracking URLs are now stable** - Won't change even if database is reorganized
✅ **Public IDs are sequential per tenant** - Easier to manage and remember
✅ **Consistent with backend tracking** - `trackingService.js` already uses public_offer_id
✅ **Future-proof** - Archived offers can still be tracked

## Testing

To test the fix:

1. **Restart Backend** (if not auto-reloading):
   ```bash
   cd /Users/abhinavvishwakarma/work/JPL/Multi-Pulpy\ Final/Pulpy_Reporting_Portal_Backend
   # Kill and restart your backend server
   ```

2. **Test in Frontend**:
   - Go to an offer detail page
   - Click "Show Tracking URL" on any assignment
   - Verify the `offer_id` parameter matches the offer's `public_offer_id` (not the internal ID)

3. **Verify in Database**:
   ```sql
   -- Check an offer's IDs
   SELECT id, public_offer_id, name FROM offers WHERE id = 4;
   
   -- Example result:
   -- id: 4, public_offer_id: 1, name: "CG_Airtel_Toonflix_Dol"
   
   -- The tracking URL should show offer_id=1 (not offer_id=4)
   ```

## Complete System Flow

1. **Offer Creation** → Auto-generates `public_offer_id`
2. **Assignment Creation** → Links publisher to offer (using internal `offer_id`)
3. **Tracking URL Generation** → Uses `public_offer_id` in URL
4. **Click Tracking** → Looks up offer by `public_offer_id`
5. **Click Storage** → Stores both `offer_id` (internal) and `public_offer_id`

## Status

✅ **FIXED** - Tracking URLs now use `public_offer_id`
✅ **Backend Updated** - `assignmentService.js` modified
✅ **No Frontend Changes Needed** - Frontend already calls backend API
✅ **Backward Compatible** - Existing assignments will work

---

**Fixed Date**: 2026-01-27  
**Files Modified**: 1 (`src/services/assignmentService.js`)  
**Lines Changed**: ~30 lines
