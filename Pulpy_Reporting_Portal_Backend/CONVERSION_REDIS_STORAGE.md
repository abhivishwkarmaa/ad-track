# 🔄 Conversion Redis Storage - Implementation Guide

## Problem
Conversions were not visible in Redis even though postbacks were being processed successfully. Only clicks were stored as Redis hashes, but conversions were only enqueued to streams without creating visible hash entries.

## Solution
Added conversion hash storage in Redis similar to how clicks are stored, making conversions visible and debuggable.

## Implementation

### 1. **Redis Hit Path** (Fast Path)
When a postback finds click data in Redis:

**Location:** `src/services/postbackService.js` → `enqueueConversionForProcessing()`

```javascript
// Creates conversion hash BEFORE enqueueing to stream
const conversionKey = `conversion:${tenantId}:${click_uuid}`;
await redis.hset(conversionKey, {
  conversion_uuid: ...,
  click_uuid: ...,
  offer_id: ...,
  amount: ...,
  status: ...,
  processed: 'false' // Worker will update to 'true'
});
await redis.expire(conversionKey, 3600); // 1 hour TTL
```

### 2. **Redis Miss Path** (Synchronous Processing)
When postback processes synchronously:

**Location:** `src/services/postbackService.js` → `processPostbackSynchronously()`

```javascript
// Creates conversion hash after synchronous processing
const conversionKey = `conversion:${tenantId}:${click_id || rcid}`;
await redis.hset(conversionKey, {
  ...conversionData,
  processed: 'true' // Already processed
});
```

### 3. **Worker Processing** (Async Path)
When postback worker processes conversions:

**Location:** `postback-worker.js` → `createConversion()`

```javascript
// Updates conversion hash after DB write
const conversionKey = `conversion:${tenantId}:${click_uuid}`;
await redis.hset(conversionKey, {
  processed: 'true',
  db_id: insertId,
  db_timestamp: new Date().toISOString()
});
```

## Redis Key Structure

### Conversion Hash Keys
```
conversion:{tenant_id}:{click_uuid}
conversion:{tenant_id}:{rcid}  (if no click_uuid)
```

### Hash Fields
```
conversion_uuid: UUID or temp ID
click_uuid: Original click UUID
offer_id: Offer ID
publisher_id: Publisher ID  
publisher_offer_id: Assignment ID
tenant_id: Tenant ID
rcid: Revenue Center ID
amount: Conversion amount
payout: Publisher payout
status: Conversion status (approved/pending/rejected)
ip: IP address
timestamp: ISO timestamp
source: Processing source (redis_hit/sync_processing/buffered_postback)
processed: 'true' or 'false'
db_id: Database ID (after processing)
db_timestamp: When written to DB
```

## TTL (Time To Live)

- **Conversion Hashes**: 1 hour (3600 seconds)
- **Clicks**: 3 hours (10800 seconds)
- **Deduplication Cache**: 24 hours (86400 seconds)

## Verification

### Check Conversion Keys in Redis

```bash
# Using redis-cli
redis-cli KEYS "conversion:*"

# Using Node.js
node -e "
const Redis = require('ioredis');
const redis = new Redis();
redis.keys('conversion:*').then(keys => {
  console.log('Found', keys.length, 'conversion keys');
  keys.forEach(key => console.log('  -', key));
  process.exit(0);
});
"
```

### View Conversion Data

```bash
# Get all conversion hashes
redis-cli --scan --pattern "conversion:*" | while read key; do
  echo "=== $key ==="
  redis-cli HGETALL "$key"
done

# Get specific conversion
redis-cli HGETALL "conversion:1:WotKR6u7sSKUtuFhKqSqZuQdk-E_OSM6pZmb"
```

### Monitor Conversion Processing

```bash
# Check stream length
redis-cli XLEN stream:conversion_processing
redis-cli XLEN stream:postback_processing

# View recent stream entries
redis-cli XREVRANGE stream:conversion_processing + - COUNT 5
```

## Processing Flow

### Redis Hit Flow
```
Postback Request
  ↓
Redis Check → Click Found ✅
  ↓
Create conversion:{tenant}:{click_uuid} hash (processed: false)
  ↓
Enqueue to stream:conversion_processing
  ↓
Return 200 OK immediately
  ↓
Worker processes → Updates hash (processed: true, db_id: X)
```

### Redis Miss Flow (Synchronous)
```
Postback Request
  ↓
Redis Check → Click Not Found ❌
  ↓
Query DB for click
  ↓
Process conversion synchronously
  ↓
Create conversion:{tenant}:{click_uuid} hash (processed: true)
  ↓
Return 200 OK with postback result
```

### Redis Miss Flow (Buffered)
```
Postback Request
  ↓
Redis Check → Click Not Found ❌
  ↓
Buffer to stream:postback_processing
  ↓
Return 200 OK (buffered)
  ↓
Worker resolves click from DB
  ↓
Create conversion:{tenant}:{click_uuid} hash (processed: false)
  ↓
Worker processes → Updates hash (processed: true)
```

## Troubleshooting

### No Conversion Keys Visible

1. **Check if conversions are being processed:**
   ```bash
   curl "http://localhost:5001/metrics/postback"
   ```

2. **Check worker logs:**
   ```bash
   pm2 logs postback-worker
   ```

3. **Verify Redis connection:**
   ```bash
   redis-cli PING
   ```

4. **Check stream processing:**
   ```bash
   redis-cli XINFO STREAM stream:conversion_processing
   ```

### Conversions Not Appearing

- **TTL Expired**: Conversions expire after 1 hour
- **Worker Not Running**: Check `pm2 list` for postback-worker status
- **Stream Not Processing**: Check worker logs for errors
- **Key Format Mismatch**: Ensure tenant_id and click_uuid are correct

## Expected Behavior

After hitting a postback endpoint:

1. ✅ **Conversion hash created** in Redis immediately
2. ✅ **Visible in Redis** with key `conversion:{tenant_id}:{click_uuid}`
3. ✅ **Hash contains** all conversion metadata
4. ✅ **TTL set** to 1 hour
5. ✅ **Worker updates** hash when DB write completes

## Key Benefits

1. **Visibility**: See conversions in Redis for debugging
2. **Monitoring**: Track conversion processing status
3. **Debugging**: Inspect conversion data without querying DB
4. **Consistency**: Same pattern as click storage
5. **Performance**: Fast lookups for recent conversions

---

**Result:** Conversions now appear in Redis as hash structures, making them visible and debuggable just like clicks! 🎯