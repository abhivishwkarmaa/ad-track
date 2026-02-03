# Test Postback Fix - Testing Guide

## Summary of Changes

### Backend Changes

1. **`testPostback.js` - `/start` endpoint**
   - Now accepts public offer IDs from tracking URLs
   - Resolves public IDs to internal IDs using `offerPublicIdService`
   - Creates Redis keys using internal offer IDs
   - Stores both public and internal IDs in session data for reference

2. **`testPostback.js` - `/status` endpoint**
   - Now accepts public offer IDs from query parameters
   - Resolves public IDs to internal IDs before Redis lookup
   - Ensures consistent key matching with `/start` endpoint

3. **`trackingService.js`** (No changes needed)
   - Already correctly resolving public IDs to internal IDs
   - Already using internal IDs for Redis key lookup
   - Test interception logic already correct

### Frontend Changes

1. **`PostbackTest.jsx`**
   - Updated offer dropdown to use `public_offer_id` (if available)
   - Falls back to `id` for backward compatibility
   - Displays public offer ID in dropdown for clarity

## Testing Steps

### Prerequisites

1. Ensure you have:
   - At least one active publisher with a global postback URL configured
   - At least one live offer assigned to that publisher
   - The offer should have a `public_offer_id` set in the database

### Test Case 1: Basic Test Postback Flow

1. **Navigate to Postback Testing page**
   - Go to `/postback-test` in the frontend

2. **Fill out the form:**
   - **Tracking URL**: Enter your tracking URL (e.g., `https://track.example.com/click?offer_id=3&pub_id=6&click_id=test123`)
   - **Offer**: Select an offer from the dropdown (should show public ID)
   - **Publisher**: Select a publisher with a configured postback URL
   - **RCID**: (Optional) Enter a custom tracking ID or generate one

3. **Start the test:**
   - Click "Fire Test"
   - A new tab should open with the tracking URL
   - The UI should show "Processing..." status

4. **Verify the flow:**
   - Check backend logs for:
     ```
     ✅ Resolved Public Offer ID to Internal ID
     Test Postback Session Started [Redis]
     [TEST] 🧪 TEST MODE ACTIVATED
     [TEST] ✓ Affiliate click_id extracted
     [TEST] 🚀 Firing Postback
     [TEST] ✅ Postback fired successfully
     [TEST] ✅ Test completed successfully
     ```

5. **Check the UI:**
   - Should show "Success!" status
   - Should display the affiliate click ID
   - Should show postback details (URL, status, latency)
   - Should show "Test Postback Successfully Fired!" toast

### Test Case 2: Verify Redis Key Matching

1. **Start a test session**
   - Note the offer ID from the dropdown (e.g., public ID = 3)

2. **Check Redis before clicking:**
   ```bash
   redis-cli
   KEYS test:postback:*
   GET test:postback:1:6:45  # Should exist (using internal ID)
   ```

3. **Click the tracking URL**
   - URL contains `offer_id=3` (public ID)

4. **Check Redis after clicking:**
   ```bash
   GET test:postback:1:6:45  # Should be updated with click_id and status=completed
   ```

5. **Verify the key matches:**
   - The key should use the **internal** offer ID (e.g., 45)
   - Not the public offer ID (e.g., 3)

### Test Case 3: Missing Click ID

1. **Create a tracking URL WITHOUT click_id or tid parameter:**
   - Example: `https://track.example.com/click?offer_id=3&pub_id=6`

2. **Start the test and click the URL**

3. **Verify the behavior:**
   - Backend logs should show:
     ```
     [TEST] ❌ No click_id/tid in URL - marking test as FAILED
     ```
   - UI should show "Test failed: No click_id found in URL"
   - Status should be "failed"

### Test Case 4: Multiple Offers

1. **Test with Offer A (public_id=3, internal_id=45)**
   - Start test session
   - Verify Redis key: `test:postback:1:6:45`
   - Click URL with `offer_id=3`
   - Verify postback fires

2. **Test with Offer B (public_id=5, internal_id=67)**
   - Start test session
   - Verify Redis key: `test:postback:1:6:67`
   - Click URL with `offer_id=5`
   - Verify postback fires

3. **Verify isolation:**
   - Each test should use its own Redis key
   - No cross-contamination between offers

### Test Case 5: Timeout Scenario

1. **Start a test session**

2. **Do NOT click the tracking URL**

3. **Wait for 15 minutes (or adjust Redis TTL for faster testing)**

4. **Check status:**
   - Should show "Test timed out. No click received."
   - Status should be "expired"

### Test Case 6: Production Flow Unaffected

1. **Make a normal click (not in test mode)**
   - URL: `https://track.example.com/click?offer_id=3&pub_id=6&click_id=real123`

2. **Verify:**
   - Click is recorded in `clicks` table
   - No test session interference
   - Normal production flow continues

## Debugging

### Check Redis Keys

```bash
# List all test postback keys
redis-cli KEYS "test:postback:*"

# Get a specific key
redis-cli GET "test:postback:1:6:45"

# Delete a test key (for cleanup)
redis-cli DEL "test:postback:1:6:45"
```

### Check Backend Logs

```bash
# Follow backend logs
tail -f /path/to/backend/logs/app.log

# Or if using PM2
pm2 logs backend
```

### Common Issues

1. **"Offer not found" error**
   - Check if offer has `public_offer_id` set in database
   - Verify offer belongs to the correct tenant
   - Check if offer status is "live"

2. **"Test timed out" error**
   - Verify the tracking URL is correct
   - Check if click actually reached the `/click` endpoint
   - Verify offer_id in URL matches the selected offer's public ID

3. **"No click_id found" error**
   - Ensure tracking URL includes `click_id` or `tid` parameter
   - Check affiliate platform is sending click ID

4. **Redis key not found**
   - Verify `/start` endpoint was called successfully
   - Check Redis TTL (default 15 minutes)
   - Ensure tenant_id, publisher_id, and offer_id match

## Expected Behavior

### ✅ Success Path

1. User selects offer (public ID displayed)
2. User enters tracking URL (contains public ID)
3. Backend resolves public ID → internal ID
4. Redis key created with internal ID
5. User clicks tracking URL
6. Backend resolves public ID → internal ID
7. Redis key found (IDs match!)
8. Click ID extracted
9. Postback fired
10. UI shows success

### ❌ Before Fix (Broken)

1. User selects offer (internal ID used)
2. Redis key created with internal ID
3. User clicks tracking URL (public ID)
4. Backend resolves public ID → different internal ID
5. Redis key NOT found (IDs don't match!)
6. Test mode not activated
7. Normal production flow (wrong!)

## Rollback Plan

If issues arise, revert the following files:

```bash
git checkout HEAD -- src/routes/testPostback.js
git checkout HEAD -- ../Pulpy_Reporting_Portal_Frontend/src/pages/Affiliate/PostbackTest.jsx
```

Then restart the backend:

```bash
pm2 restart backend
```

## Success Criteria

- [ ] Test postback fires successfully with public offer IDs
- [ ] Redis keys use internal offer IDs consistently
- [ ] Frontend displays public offer IDs in dropdown
- [ ] Status polling works correctly
- [ ] Multiple offers can be tested independently
- [ ] Timeout handling works as expected
- [ ] Production flow remains unaffected
- [ ] No database writes during test mode
