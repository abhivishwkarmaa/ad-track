# 🎯 Multi-Tenant Offer System with Stable Public IDs - Implementation Guide

## 📋 Overview

This implementation provides a **production-grade multi-tenant offer tracking system** with:

✅ **Stable public_offer_id** - Never changes, never reused
✅ **No deletions** - Only status changes (draft → live → paused → archived)
✅ **Dynamic URL parameters** - Flexible placeholder system
✅ **Multi-tenant isolation** - Complete data separation
✅ **Tracking URLs that never break** - Forever valid links

---

## 🗄️ Database Changes

### 1. Migration Files Created

#### `008_add_stable_public_offer_ids.sql`
- Adds `public_offer_id` column to `offers` table
- Creates unique constraint: `(tenant_id, public_offer_id)`
- Adds optimized index for lookups
- Updates status enum to include 'archived'
- Populates existing offers with sequential public IDs

#### `009_add_offer_params_table.sql`
- Creates `offer_params` table for dynamic parameters
- Adds `extra_params` JSON column to `clicks` table
- Adds `extra_params` JSON column to `conversions` table

### 2. Schema Changes

```sql
-- Offers table now has:
ALTER TABLE offers ADD COLUMN public_offer_id INT NOT NULL;
ALTER TABLE offers ADD UNIQUE KEY uniq_tenant_public_offer_id (tenant_id, public_offer_id);
ALTER TABLE offers MODIFY COLUMN status ENUM('draft', 'live', 'paused', 'archived');

-- New table for dynamic parameters:
CREATE TABLE offer_params (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  offer_id INT NOT NULL,
  tenant_id INT,
  param_key VARCHAR(64),
  is_required BOOLEAN DEFAULT false,
  default_value VARCHAR(255),
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
);

-- Clicks and conversions now store extra params:
ALTER TABLE clicks ADD COLUMN extra_params JSON;
ALTER TABLE conversions ADD COLUMN extra_params JSON;
```

---

## 🔧 Backend Services Created

### 1. `offerPublicIdService.js`
**Purpose**: Manage stable public offer IDs

**Key Methods**:
- `generatePublicOfferId(tenantId)` - Generate next sequential ID per tenant
- `getOfferByPublicId(publicOfferId, tenantId, status)` - Lookup by public ID
- `archiveOffer(offerId, tenantId)` - Soft delete (archive)
- `validateOfferForTracking(offer)` - Check if offer can accept clicks

**Usage**:
```javascript
// Generate new public ID when creating offer
const publicOfferId = await offerPublicIdService.generatePublicOfferId(tenantId);

// Lookup offer by public ID (for tracking)
const offer = await offerPublicIdService.getOfferByPublicId(7, tenantId, 'live');

// Archive instead of delete
await offerPublicIdService.archiveOffer(offerId, tenantId);
```

### 2. `offerParamsService.js`
**Purpose**: Handle dynamic URL parameters

**Key Methods**:
- `setOfferParams(offerId, tenantId, params)` - Save parameter definitions
- `getOfferParams(offerId, tenantId)` - Retrieve parameters
- `applyPlaceholders(urlTemplate, params)` - Replace {placeholders}
- `validateRequiredParams(offerParams, providedParams)` - Validate required params
- `extractExtraParams(query)` - Extract non-standard parameters
- `mergeWithDefaults(offerParams, providedParams)` - Apply default values

**Usage**:
```javascript
// Define offer parameters
await offerParamsService.setOfferParams(offerId, tenantId, [
  { param_key: 'click_id', is_required: true },
  { param_key: 'source', is_required: false, default_value: 'direct' },
  { param_key: 'sub_source', is_required: false }
]);

// Apply placeholders to URL
const url = 'https://adv.com/track?cid={click_id}&src={source}';
const finalUrl = offerParamsService.applyPlaceholders(url, {
  click_id: '12345',
  source: 'facebook'
});
// Result: https://adv.com/track?cid=12345&src=facebook
```

---

## 🔄 Updated Services

### `offer.service.js` Changes

#### 1. **createOffer** - Now generates public_offer_id
```javascript
// Auto-generates stable public ID
const publicOfferId = await offerPublicIdService.generatePublicOfferId(tenantId);

// Saves offer parameters if provided
if (data.offer_params && Array.isArray(data.offer_params)) {
  await offerParamsService.setOfferParams(insertId, tenantId, data.offer_params);
}
```

#### 2. **deleteOffer** - Now archives instead of deleting
```javascript
// OLD: DELETE FROM offers WHERE id = ?
// NEW: UPDATE offers SET status = 'archived' WHERE id = ?
```

This ensures:
- Tracking URLs remain valid
- Historical data is preserved
- Reports stay accurate
- No broken links

---

## 📡 Tracking URL Format

### Public URL Structure
```
https://tenant.track.com/click?
  offer_id=7&              ← public_offer_id (stable, never changes)
  pub_id=5&                ← publisher ID
  click_id={click_id}&     ← dynamic placeholder
  source={source}&         ← dynamic placeholder
  sub_source={sub_source}  ← dynamic placeholder
```

### How It Works

1. **Tenant Resolution**: From subdomain (tenant.track.com)
2. **Offer Lookup**: Using `public_offer_id` + `tenant_id`
3. **Status Check**: Only 'live' offers accept clicks
4. **Parameter Validation**: Check required params
5. **URL Generation**: Apply placeholders to destination URL
6. **Click Storage**: Save to Redis → MySQL

---

## 🎨 Frontend Integration

### Offer Creation Form

```javascript
// Example offer creation payload
{
  "name": "Premium Offer",
  "advertiser_id": 1,
  "tenant_id": 1,
  "status": "draft",
  "offer_url": "https://advertiser.com/track?cid={click_id}&src={source}",
  
  // NEW: Define dynamic parameters
  "offer_params": [
    {
      "param_key": "click_id",
      "is_required": true
    },
    {
      "param_key": "source",
      "is_required": false,
      "default_value": "direct"
    },
    {
      "param_key": "sub_source",
      "is_required": false
    }
  ]
}
```

### Offer List View

```javascript
// Filter offers by status
GET /api/offers?type=live      // Active offers
GET /api/offers?type=paused    // Paused offers
GET /api/offers?type=archived  // Archived offers (hidden from active use)
```

### Tracking Link Generator

```javascript
// Generate tracking URL
function generateTrackingUrl(offer, publisher, params = {}) {
  const baseUrl = `https://${tenant}.track.com/click`;
  const queryParams = new URLSearchParams({
    offer_id: offer.public_offer_id,  // Use public ID
    pub_id: publisher.id,
    ...params
  });
  
  return `${baseUrl}?${queryParams}`;
}

// Example usage
const trackingUrl = generateTrackingUrl(offer, publisher, {
  click_id: '{click_id}',
  source: '{source}'
});
// Result: https://tenant.track.com/click?offer_id=7&pub_id=5&click_id={click_id}&source={source}
```

---

## 🚀 Migration Steps

### Step 1: Run Database Migrations

```bash
cd /Users/abhinavvishwakarma/work/JPL/Multi-Pulpy\ Final/Pulpy_Reporting_Portal_Backend

# Run migration 008 (public offer IDs)
mysql -h 157.10.98.169 -u tvfvdjub_campaign -p'uUz?6h[XVzz)F^XS' tvfvdjub_Pulpy_Reporting_Portal < src/db/migrations/008_add_stable_public_offer_ids.sql

# Run migration 009 (offer params)
mysql -h 157.10.98.169 -u tvfvdjub_campaign -p'uUz?6h[XVzz)F^XS' tvfvdjub_Pulpy_Reporting_Portal < src/db/migrations/009_add_offer_params_table.sql
```

### Step 2: Verify Migrations

```sql
-- Check public_offer_id was added
SELECT id, public_offer_id, name, status, tenant_id FROM offers LIMIT 10;

-- Check offer_params table exists
DESCRIBE offer_params;

-- Verify existing offers have public IDs
SELECT tenant_id, COUNT(*) as offer_count, MAX(public_offer_id) as max_public_id 
FROM offers 
GROUP BY tenant_id;
```

### Step 3: Update Frontend

1. **Offer Creation Form**: Add parameter definition UI
2. **Offer List**: Add "Archived" tab
3. **Delete Button**: Change to "Archive" button
4. **Tracking Link Generator**: Use `public_offer_id` instead of `id`

---

## 📊 API Changes

### Create Offer
```javascript
POST /api/offers
{
  "name": "Test Offer",
  "advertiser_id": 1,
  "status": "draft",
  "offer_url": "https://example.com/track?cid={click_id}",
  
  // NEW: Optional parameter definitions
  "offer_params": [
    { "param_key": "click_id", "is_required": true },
    { "param_key": "source", "is_required": false, "default_value": "web" }
  ]
}

// Response includes public_offer_id
{
  "id": 123,
  "public_offer_id": 7,  // ← Stable ID for tracking URLs
  "name": "Test Offer",
  ...
}
```

### Delete Offer (Now Archives)
```javascript
DELETE /api/offers/123

// Actually executes:
// UPDATE offers SET status = 'archived' WHERE id = 123
```

### Get Offer Parameters
```javascript
GET /api/offers/123/params

// Response
[
  {
    "param_key": "click_id",
    "is_required": true,
    "default_value": null
  },
  {
    "param_key": "source",
    "is_required": false,
    "default_value": "web"
  }
]
```

---

## 🔒 Safety Rules

### ✅ DO's
1. **Always use `public_offer_id` in tracking URLs**
2. **Archive offers instead of deleting**
3. **Define parameters when creating offers**
4. **Validate required parameters on click**
5. **Store extra_params in clicks table**

### ❌ DON'Ts
1. **Never delete offers from database**
2. **Never change public_offer_id**
3. **Never reuse public_offer_id**
4. **Never use internal `id` in tracking URLs**
5. **Never break tracking URL format**

---

## 📈 Benefits

### 1. **Link Stability**
- Tracking URLs never break
- Historical links remain valid
- No need to update external systems

### 2. **Data Integrity**
- All historical data preserved
- Reports always accurate
- Audit trail maintained

### 3. **Flexibility**
- Dynamic parameters per offer
- No schema changes for new params
- Easy to add custom tracking

### 4. **Multi-Tenant Safety**
- Complete data isolation
- Per-tenant ID sequences
- No cross-tenant access

### 5. **Scalability**
- No performance penalty
- Efficient lookups
- Clean architecture

---

## 🧪 Testing

### Test Public ID Generation
```javascript
// Create multiple offers for same tenant
const offer1 = await offerService.createOffer({ ...data, tenant_id: 1 });
const offer2 = await offerService.createOffer({ ...data, tenant_id: 1 });
const offer3 = await offerService.createOffer({ ...data, tenant_id: 1 });

// Verify sequential public IDs
console.log(offer1.public_offer_id); // 1
console.log(offer2.public_offer_id); // 2
console.log(offer3.public_offer_id); // 3
```

### Test Archiving
```javascript
// Archive an offer
await offerService.deleteOffer(offerId, tenantId);

// Verify status changed to 'archived'
const offer = await offerService.getOfferById(offerId, tenantId);
console.log(offer.status); // 'archived'

// Verify offer still exists in database
// Verify tracking URL still resolves (but rejects clicks)
```

### Test Dynamic Parameters
```javascript
// Create offer with params
const offer = await offerService.createOffer({
  ...data,
  offer_params: [
    { param_key: 'click_id', is_required: true },
    { param_key: 'source', is_required: false, default_value: 'web' }
  ]
});

// Test parameter validation
const params = await offerParamsService.getOfferParams(offer.id, tenantId);
const validation = offerParamsService.validateRequiredParams(params, {
  source: 'facebook'
});
console.log(validation.valid); // false (missing click_id)
console.log(validation.missing); // ['click_id']
```

---

## 📝 Client Communication

### What to Tell the Client

> **Offer IDs are generated sequentially and permanently.**
> 
> - Each offer gets a unique public ID that never changes
> - IDs are sequential per tenant (1, 2, 3, ...)
> - Even if an offer is archived, its ID is never reused
> - This ensures tracking links and reports always remain accurate
> - Archived offers are hidden from active use but preserved for history
> 
> **This is how all professional tracking platforms work** (HasOffers, Cake, Everflow, etc.)

---

## 🎯 Next Steps

1. ✅ Run database migrations
2. ✅ Test public ID generation
3. ✅ Update frontend offer creation form
4. ✅ Add parameter definition UI
5. ✅ Update tracking link generator
6. ✅ Add "Archived" tab to offer list
7. ✅ Change "Delete" to "Archive"
8. ✅ Test end-to-end tracking flow

---

## 📚 Files Created/Modified

### New Files
- `src/db/migrations/008_add_stable_public_offer_ids.sql`
- `src/db/migrations/009_add_offer_params_table.sql`
- `src/services/offerPublicIdService.js`
- `src/services/offerParamsService.js`

### Modified Files
- `src/services/offer.service.js` - Added public ID generation and archiving
- (Frontend files to be updated)

---

## 🔗 References

- [HasOffers Documentation](https://developers.tune.com/)
- [Everflow API Docs](https://developers.everflow.io/)
- [Cake Marketing Platform](https://getcake.com/)

---

**Implementation Status**: ✅ Backend Complete | ⏳ Frontend Pending | ⏳ Testing Pending
