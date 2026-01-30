# Test Conversion Implementation Summary

## Overview
Successfully implemented automatic test conversion creation for browser-based postback testing, with two access points:
1. **Test Postback Page**: Manual tracking URL input
2. **Live Logs Page**: One-click test postback from existing clicks

## Features Implemented

### 1. Backend API Endpoint
**File**: `src/controllers/adminController.js`
**Endpoint**: `POST /api/admin/create-test-conversion`

**Functionality**:
- Accepts tracking URL as input
- Extracts offer_id, pub_id, and optional tid from URL
- Waits 2 seconds for click to be processed
- Searches for matching click in database
- Creates test conversion with `is_test = 1` flag
- Fires affiliate global postback automatically
- Logs postback result to `affiliate_postback_logs` table

**Test Conversion Properties**:
```javascript
{
  conversion_id: UUID,
  click_id: <real_click_id>,
  affiliate_click_id: <source_click_id>,
  status: 'approved',
  payout: 0,
  revenue: 0,
  is_test: 1  // ✅ Marked as test
}
```

**Postback Macro Replacements**:
- `{click_id}`, `{clickid}`, `{affiliate_click_id}`, `{rcid}` → affiliate click ID
- `{status}` → 'approved'
- `{payout}`, `{amount}` → '0'
- `{txid}`, `{transaction_id}` → conversion UUID
- `{test}` → '1' (indicates test conversion)

### 2. Frontend - Test Postback Page
**File**: `src/pages/Affiliate/PostbackTest.jsx`

**Updated Flow**:
1. User enters tracking URL
2. User clicks "Fire Test"
3. Tracking URL opens in new tab (real browser click)
4. Frontend waits 3 seconds
5. Frontend calls `createTestConversion` API
6. Displays conversion details and postback result

**UI Components**:
- Tracking URL input field (required)
- Affiliate selector (optional - for postback preview)
- RCID input (optional - appended as tid parameter)
- Real-time status updates (processing → completed/error)
- Conversion details display
- Postback result display with HTTP status and response

**Status Indicators**:
- 🔗 Ready to Test (initial state)
- ⏳ Processing (creating conversion)
- ✅ Success (conversion created, postback fired)
- ❌ Error (with error message)

### 3. Frontend - Live Logs Page
**File**: `src/pages/LiveLogs/LiveLogs.jsx`

**New Feature**: "Fire Test Postback" button in Actions column

**Functionality**:
- Added "Actions" column to clicks table
- Each click row has a "🔥 Test" button
- Button disabled if click already converted
- Automatically builds tracking URL from click data
- Calls `createTestConversion` API
- Shows loading state during processing
- Refreshes logs after successful conversion
- Toast notifications for success/error

**Button States**:
- `🔥 Test` - Ready to fire
- `Testing...` - Processing
- Disabled (grayed out) - Already converted

### 4. API Service
**File**: `src/services/api.js`

**New Method**:
```javascript
publishersAPI.createTestConversion(tracking_url)
```

### 5. Backend Route
**File**: `src/routes/admin.js`

**New Route**:
```javascript
fastify.post('/create-test-conversion', adminController.createTestConversion);
```

## Database Impact

### Test Conversions
- Stored in `conversions` table with `is_test = 1`
- **Financial Impact**: ZERO (payout = 0, revenue = 0)
- **Reporting**: Can be filtered out using `is_test` flag
- **Billing**: Excluded from financial calculations

### Postback Logs
- Stored in `affiliate_postback_logs` table
- Linked to test conversion via `conversion_id`
- Contains full postback URL, HTTP status, and response
- Useful for debugging postback issues

## User Workflows

### Workflow 1: Test Postback Page
```
1. Navigate to "Test Postback" page
2. Enter tracking URL (e.g., https://domain.com/track?offer_id=1&pub_id=2)
3. Optionally select affiliate to preview postback URL
4. Optionally add custom RCID
5. Click "Fire Test"
6. New tab opens with tracking URL
7. Wait 3 seconds (automatic)
8. Test conversion created
9. Postback fired to affiliate
10. View results:
    - Conversion ID
    - Click ID
    - Affiliate Click ID
    - Postback URL
    - HTTP Status
    - Response Body
```

### Workflow 2: Live Logs Page
```
1. Navigate to "Live Logs" page
2. View recent clicks
3. Find click to test
4. Click "🔥 Test" button in Actions column
5. Test conversion created automatically
6. Postback fired to publisher who owns the click
7. Toast notification shows success/error
8. Logs refresh to show new conversion
```

## Benefits

### 1. Real Traffic Testing
- Uses actual clicks from database
- Tests real redirect chain
- Validates complete tracking flow
- No simulated data

### 2. Zero Financial Impact
- `payout = 0` and `revenue = 0`
- `is_test = 1` flag for filtering
- Excluded from billing reports
- Safe for production testing

### 3. Complete Postback Testing
- Fires real HTTP requests to affiliate endpoints
- Tests macro replacement
- Validates postback URL configuration
- Logs full request/response for debugging

### 4. Easy Access
- Test from dedicated page (manual URL)
- Test from Live Logs (one-click)
- No need to trigger real conversions
- Instant feedback

### 5. Debugging Friendly
- Full postback logs stored
- HTTP status codes visible
- Response bodies captured
- Conversion details displayed

## Technical Details

### Click Lookup Logic
```sql
SELECT * FROM clicks 
WHERE offer_id = ? 
  AND publisher_id = ? 
  AND tenant_id = ?
  AND (source_click_id = ? OR click_id = ? OR tid = ?)  -- if tid provided
ORDER BY created_at DESC 
LIMIT 1
```

### Postback URL Example
**Before Macro Replacement**:
```
https://affiliate.com/postback?click_id={click_id}&status={status}&payout={payout}&test={test}
```

**After Macro Replacement**:
```
https://affiliate.com/postback?click_id=abc123&status=approved&payout=0&test=1
```

### Error Handling

**Common Errors**:
1. **No click found**: Click not yet processed or doesn't exist
   - Solution: Wait a few seconds and try again
   
2. **Invalid tracking URL**: Malformed URL or missing parameters
   - Solution: Ensure URL contains offer_id and pub_id
   
3. **Publisher not found**: Invalid publisher ID
   - Solution: Verify publisher exists
   
4. **No postback URL configured**: Publisher has no global postback
   - Solution: Configure global postback URL for publisher
   
5. **Postback request failed**: Network error or timeout
   - Solution: Check affiliate endpoint availability

## Files Modified

### Backend
1. `src/controllers/adminController.js` - Added `createTestConversion` method
2. `src/routes/admin.js` - Added route for test conversion endpoint

### Frontend
1. `src/pages/Affiliate/PostbackTest.jsx` - Updated to call createTestConversion API
2. `src/pages/LiveLogs/LiveLogs.jsx` - Added Fire Test Postback button
3. `src/services/api.js` - Added `createTestConversion` API method

## Testing Instructions

### Test Postback Page
1. Get a tracking URL from an assignment
2. Navigate to Test Postback page
3. Paste tracking URL
4. Click "Fire Test"
5. Verify new tab opens
6. Wait for conversion creation
7. Check conversion details displayed
8. Verify postback result shown

### Live Logs Page
1. Navigate to Live Logs
2. Generate some test clicks
3. Click "🔥 Test" button on a click
4. Verify "Testing..." state
5. Check toast notification
6. Verify conversion appears in logs
7. Check postback logs page for entry

## Security Considerations

1. **Tenant Isolation**: All queries include tenant_id filter
2. **Authentication**: Requires admin authentication
3. **Validation**: URL format and parameters validated
4. **Rate Limiting**: Consider adding rate limits for production
5. **Test Flag**: Always set `is_test = 1` to prevent financial impact

## Future Enhancements

1. **Batch Testing**: Test multiple clicks at once
2. **Scheduled Tests**: Automated postback testing
3. **Test History**: View past test conversions
4. **Postback Retry**: Retry failed postbacks
5. **Custom Payout**: Allow testing with specific payout values
6. **Webhook Testing**: Test advertiser webhooks similarly

## Conclusion

The test conversion feature provides a safe, easy way to test postback integrations without financial impact. It works with real traffic data and provides complete visibility into the postback process, making it an essential tool for debugging and validating affiliate integrations.
