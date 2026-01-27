# 🚀 Quick Start: Stable Public Offer IDs

## ✅ What's Been Done

1. **Database Migrations Created**:
   - `008_add_stable_public_offer_ids.sql` ✅ Applied
   - `009_add_offer_params_table.sql` ⏳ Pending (connection limit)

2. **Backend Services Created**:
   - `offerPublicIdService.js` - Manages stable public IDs
   - `offerParamsService.js` - Handles dynamic parameters

3. **Services Updated**:
   - `offer.service.js` - Now generates public IDs and archives instead of deletes

## 🔧 Next Steps

### Step 1: Complete Database Migration

The second migration needs to be run when database connections are available:

```bash
cd /Users/abhinavvishwakarma/work/JPL/Multi-Pulpy\ Final/Pulpy_Reporting_Portal_Backend

# Run when database is less busy
mysql -h 157.10.98.169 -u tvfvdjub_campaign -p'uUz?6h[XVzz)F^XS' tvfvdjub_Pulpy_Reporting_Portal < src/db/migrations/009_add_offer_params_table.sql
```

### Step 2: Verify Migrations

```bash
# Run verification script
mysql -h 157.10.98.169 -u tvfvdjub_campaign -p'uUz?6h[XVzz)F^XS' tvfvdjub_Pulpy_Reporting_Portal < verify_stable_offer_ids.sql
```

### Step 3: Test Backend

```bash
# Restart your backend server
npm run dev

# Test creating a new offer - it should auto-generate public_offer_id
curl -X POST http://localhost:5001/api/offers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Offer",
    "advertiser_id": 1,
    "tenant_id": 1,
    "status": "draft",
    "offer_url": "https://example.com/track",
    "offer_currency": "USD",
    "country": "US",
    "advertiser_model": "CPA",
    "advertiser_amount": 10.00,
    "affiliate_model": "CPA",
    "affiliate_amount": 8.00
  }'

# Check response includes public_offer_id
```

### Step 4: Update Frontend

#### A. Offer Creation Form

Add parameter definition UI:

```jsx
// In NewOffer.jsx or similar
const [offerParams, setOfferParams] = useState([]);

const addParameter = () => {
  setOfferParams([...offerParams, {
    param_key: '',
    is_required: false,
    default_value: ''
  }]);
};

// In form submission
const offerData = {
  ...formData,
  offer_params: offerParams.filter(p => p.param_key) // Only include filled params
};
```

#### B. Offer List

Add "Archived" tab:

```jsx
// In ManageOffers.jsx or similar
const [activeTab, setActiveTab] = useState('live');

<Tabs>
  <Tab label="Live" onClick={() => setActiveTab('live')} />
  <Tab label="Paused" onClick={() => setActiveTab('paused')} />
  <Tab label="Draft" onClick={() => setActiveTab('draft')} />
  <Tab label="Archived" onClick={() => setActiveTab('archived')} />
</Tabs>

// Fetch offers based on tab
useEffect(() => {
  fetchOffers({ type: activeTab });
}, [activeTab]);
```

#### C. Delete Button → Archive Button

```jsx
// Change button text and icon
<Button 
  onClick={() => archiveOffer(offer.id)}
  icon={<ArchiveIcon />}
>
  Archive
</Button>

// Update confirmation message
const archiveOffer = (id) => {
  if (confirm('Archive this offer? It will be hidden but tracking URLs will remain valid.')) {
    api.delete(`/api/offers/${id}`); // Backend now archives instead of deletes
  }
};
```

#### D. Tracking Link Generator

Use `public_offer_id` instead of `id`:

```jsx
const generateTrackingUrl = (offer, publisher) => {
  const baseUrl = `https://${tenant}.track.com/click`;
  return `${baseUrl}?offer_id=${offer.public_offer_id}&pub_id=${publisher.id}`;
};

// Display in UI
<div>
  <label>Tracking URL:</label>
  <input 
    value={generateTrackingUrl(selectedOffer, selectedPublisher)}
    readOnly
  />
</div>
```

## 📊 How It Works

### Creating an Offer

**Before**:
```javascript
{
  "id": 123,
  "name": "Test Offer",
  "status": "live"
}
```

**After**:
```javascript
{
  "id": 123,
  "public_offer_id": 7,  // ← Stable ID for tracking URLs
  "name": "Test Offer",
  "status": "live",
  "offer_params": [      // ← Optional dynamic parameters
    { "param_key": "click_id", "is_required": true },
    { "param_key": "source", "is_required": false }
  ]
}
```

### Tracking URLs

**Before** (using internal ID):
```
https://track.com/click?offer_id=123&pub_id=5
```
❌ Problem: If offer is deleted, ID 123 might be reused

**After** (using public ID):
```
https://track.com/click?offer_id=7&pub_id=5
```
✅ Solution: Public ID 7 is permanent, never reused

### Deleting Offers

**Before**:
```sql
DELETE FROM offers WHERE id = 123;
```
❌ Problem: Tracking URLs break, data lost

**After**:
```sql
UPDATE offers SET status = 'archived' WHERE id = 123;
```
✅ Solution: Offer hidden but data preserved, URLs still resolve

## 🧪 Testing Checklist

- [ ] Run database migrations
- [ ] Verify `public_offer_id` column exists
- [ ] Create new offer and check it has `public_offer_id`
- [ ] Verify public IDs are sequential per tenant
- [ ] Test archiving an offer (delete button)
- [ ] Verify archived offer is hidden from active list
- [ ] Verify archived offer appears in "Archived" tab
- [ ] Test tracking URL with public_offer_id
- [ ] Verify archived offer rejects new clicks
- [ ] Test dynamic parameters (if implemented)

## 📝 API Examples

### Create Offer with Parameters
```bash
POST /api/offers
{
  "name": "Premium Offer",
  "advertiser_id": 1,
  "tenant_id": 1,
  "status": "live",
  "offer_url": "https://adv.com/track?cid={click_id}&src={source}",
  "offer_currency": "USD",
  "country": "US",
  "advertiser_model": "CPA",
  "advertiser_amount": 10.00,
  "affiliate_model": "CPA",
  "affiliate_amount": 8.00,
  "offer_params": [
    {
      "param_key": "click_id",
      "is_required": true
    },
    {
      "param_key": "source",
      "is_required": false,
      "default_value": "direct"
    }
  ]
}
```

### Get Offer Parameters
```bash
GET /api/offers/123/params

Response:
[
  {
    "param_key": "click_id",
    "is_required": true,
    "default_value": null
  },
  {
    "param_key": "source",
    "is_required": false,
    "default_value": "direct"
  }
]
```

### Archive Offer
```bash
DELETE /api/offers/123

# Actually executes:
# UPDATE offers SET status = 'archived' WHERE id = 123
```

## 🎯 Key Benefits

1. **Tracking URLs Never Break** - Public IDs are permanent
2. **Data Integrity** - No data loss from deletions
3. **Clean Reports** - Historical data always accurate
4. **Flexible Parameters** - Add custom tracking without schema changes
5. **Multi-Tenant Safe** - Complete isolation per tenant

## 📚 Documentation

See `STABLE_OFFER_IDS_IMPLEMENTATION.md` for complete details.

## ⚠️ Important Notes

1. **Never delete offers** - Always archive
2. **Never change public_offer_id** - It's permanent
3. **Never reuse public_offer_id** - Sequential only
4. **Always use public_offer_id in tracking URLs** - Not internal ID
5. **Test thoroughly** - Especially tracking URL generation

## 🆘 Troubleshooting

### Migration Fails
```bash
# Check if column already exists
mysql -h 157.10.98.169 -u tvfvdjub_campaign -p'uUz?6h[XVzz)F^XS' \
  -e "DESCRIBE tvfvdjub_Pulpy_Reporting_Portal.offers" | grep public_offer_id
```

### Public ID Not Generated
```javascript
// Check service is imported
import offerPublicIdService from './offerPublicIdService.js';

// Check it's called in createOffer
const publicOfferId = await offerPublicIdService.generatePublicOfferId(tenantId);
```

### Tracking URL Not Working
```javascript
// Ensure using public_offer_id, not id
const url = `https://track.com/click?offer_id=${offer.public_offer_id}`;
```

---

**Status**: Backend ✅ | Database ⏳ | Frontend ⏳
