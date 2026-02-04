# Subscription System - Quick Reference Card

## 🎯 Quick Start

### Check Subscription Status
```javascript
import subscriptionService from '../services/subscriptionService.js';

const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
console.log(status.tenant.status); // TRIAL, ACTIVE, EXPIRED, or SUSPENDED
console.log(status.subscription.days_left); // Days remaining
```

### Protect a Route
```javascript
import { requireActiveSubscription } from '../middleware/subscriptionAccess.js';

fastify.post('/api/offers', {
  preHandler: [authenticateAdmin, requireActiveSubscription]
}, createOffer);
```

---

## 📊 Tenant States

| State | Access | Can Login? | Can Read? | Can Write? |
|-------|--------|-----------|-----------|------------|
| **TRIAL** | Full | ✅ | ✅ | ✅ |
| **ACTIVE** | Full | ✅ | ✅ | ✅ |
| **EXPIRED** | Read-Only | ✅ | ✅ | ❌ |
| **SUSPENDED** | Blocked | ❌ | ❌ | ❌ |

---

## 🔐 Middleware Options

### 1. Require Active Subscription
Blocks EXPIRED and SUSPENDED tenants.
```javascript
import { requireActiveSubscription } from '../middleware/subscriptionAccess.js';

fastify.post('/api/resource', {
  preHandler: requireActiveSubscription
}, handler);
```

### 2. Allow Read-Only Access
Blocks only SUSPENDED tenants.
```javascript
import { allowReadOnlyAccess } from '../middleware/subscriptionAccess.js';

fastify.get('/api/reports', {
  preHandler: allowReadOnlyAccess
}, handler);
```

### 3. Attach Status (No Blocking)
Just attaches subscription status to request.
```javascript
import { attachSubscriptionStatus } from '../middleware/subscriptionAccess.js';

fastify.get('/api/dashboard', {
  preHandler: attachSubscriptionStatus
}, (request, reply) => {
  const status = request.subscriptionStatus;
  // Use status to customize response
});
```

---

## 🛠️ Service Methods

### Get Status
```javascript
const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
```

### Start Trial
```javascript
await subscriptionService.startTrial(tenantId, userId);
```

### Activate Subscription
```javascript
const endDate = new Date('2026-12-31T23:59:59Z');
await subscriptionService.activateSubscription(tenantId, endDate, 'pro', adminId);
```

### Extend Subscription
```javascript
await subscriptionService.extendSubscription(tenantId, 30, adminId); // 30 days
```

### Set Custom End Date
```javascript
const endDate = new Date('2027-01-31T23:59:59Z');
await subscriptionService.setSubscriptionEndDate(tenantId, endDate, adminId);
```

### Suspend Tenant
```javascript
await subscriptionService.suspendTenant(tenantId, adminId, 'Payment failed');
```

### Unsuspend Tenant
```javascript
await subscriptionService.unsuspendTenant(tenantId, adminId);
```

### Reset Trial
```javascript
await subscriptionService.resetTrial(tenantId, adminId);
```

### Update State
```javascript
await subscriptionService.updateTenantState(tenantId);
```

### Get History
```javascript
const history = await subscriptionService.getSubscriptionHistory(tenantId, 50);
```

---

## 🌐 API Endpoints

### Admin Endpoints
```
GET    /api/admin/subscriptions/:tenantId
POST   /api/admin/subscriptions/:tenantId/activate
POST   /api/admin/subscriptions/:tenantId/extend
POST   /api/admin/subscriptions/:tenantId/set-end-date
POST   /api/admin/subscriptions/:tenantId/suspend
POST   /api/admin/subscriptions/:tenantId/unsuspend
POST   /api/admin/subscriptions/:tenantId/reset-trial
GET    /api/admin/subscriptions/:tenantId/history
```

### Tenant Endpoint
```
GET    /api/subscription/status
```

---

## 📝 Response Structure

```javascript
{
  tenant: {
    id: 1,
    name: "Acme Corp",
    slug: "acme",
    status: "TRIAL",
    trial_start_at: "2026-02-04T07:00:00.000Z",
    trial_end_at: "2026-02-14T07:00:00.000Z",
    subscription_start_at: null,
    subscription_end_at: null,
    subscription_plan: null
  },
  subscription: {
    state: "TRIAL",
    access_level: "full",        // full, read_only, or blocked
    days_left: 10,
    end_date: "2026-02-14T07:00:00.000Z",
    is_warning: false,           // true if ≤ 3 days left
    is_trial: true,
    is_active: false,
    is_expired: false,
    is_suspended: false
  }
}
```

---

## 🎨 UI Helpers

### Check Access
```javascript
import { canWrite, canRead } from '../middleware/subscriptionAccess.js';

if (canWrite(request)) {
  // Show create/edit/delete buttons
}

if (!canRead(request)) {
  // Show "Access Denied" message
}
```

### Get Warning Message
```javascript
import { getSubscriptionWarning } from '../middleware/subscriptionAccess.js';

const warning = getSubscriptionWarning(request);
if (warning) {
  // Display warning banner
}
```

### Get Countdown Text
```javascript
import { getCountdownText } from '../middleware/subscriptionAccess.js';

const countdown = getCountdownText(request);
// Returns: "Trial: 10 days left" or "Subscription expires in 30 days"
```

---

## ⏰ Trial Rules

- **Duration:** 10 days (hardcoded)
- **Starts:** On first login (not on tenant creation)
- **Cannot restart:** Unless admin explicitly resets
- **Warning:** Shows when ≤ 3 days remaining
- **Expiry:** Becomes EXPIRED after 10 days

---

## 💳 Subscription Rules

- **Belongs to:** Tenant (not individual users)
- **Takes precedence:** Over trial if both exist
- **Expiry:** Automatically becomes EXPIRED when end date passes
- **Extension:** Can be extended by admin at any time

---

## 🔄 State Transition Rules

```
TRIAL → ACTIVE     (subscription activated)
TRIAL → EXPIRED    (trial expires)
ACTIVE → EXPIRED   (subscription expires)
ACTIVE → SUSPENDED (admin suspends)
EXPIRED → ACTIVE   (subscription renewed)
SUSPENDED → *      (admin unsuspends, restored to appropriate state)
```

---

## 🕐 Timezone Handling

**ALWAYS USE UTC:**
```javascript
// ✅ Correct
const now = new Date(); // UTC
const endDate = new Date('2026-12-31T23:59:59Z'); // UTC

// ❌ Wrong
const now = new Date().toLocaleString(); // Local time
```

**Database:**
```sql
-- All timestamps stored in UTC
SET time_zone = '+00:00';
```

---

## 📅 Countdown Calculation

```javascript
// Days left (always round up)
const daysLeft = Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));

// Warning threshold
const isWarning = daysLeft <= 3 && daysLeft > 0;
```

---

## 🚨 Error Responses

### Expired Tenant (403)
```json
{
  "success": false,
  "error": "Subscription Expired",
  "message": "Your access has expired. Please contact billing@track-myads.com to continue.",
  "subscription_status": "expired"
}
```

### Suspended Tenant (403)
```json
{
  "success": false,
  "error": "Account Suspended",
  "message": "Your account has been suspended. Please contact billing@track-myads.com for assistance.",
  "subscription_status": "suspended"
}
```

---

## 🧪 Testing

### Run Tests
```bash
npm test src/tests/subscription.test.js
```

### Manual Test
```bash
# Check status
curl -X GET 'http://admin.track-myads.com/api/admin/subscriptions/1' \
  -H 'Authorization: Bearer TOKEN'

# Activate subscription
curl -X POST 'http://admin.track-myads.com/api/admin/subscriptions/1/activate' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"end_date": "2026-12-31T23:59:59Z", "plan": "pro"}'
```

---

## 🗄️ Database Queries

### Check Tenant State
```sql
SELECT id, slug, status, trial_end_at, subscription_end_at, 
       TIMESTAMPDIFF(DAY, UTC_TIMESTAMP(), COALESCE(subscription_end_at, trial_end_at)) as days_left
FROM tenants 
WHERE id = 1;
```

### Update State Manually
```sql
CALL calculate_tenant_state(1);
```

### Update All States
```sql
CALL update_all_tenant_states();
```

### View History
```sql
SELECT * FROM subscription_history 
WHERE tenant_id = 1 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 🔧 Common Tasks

### Task: Activate 30-day subscription
```javascript
const endDate = new Date();
endDate.setDate(endDate.getDate() + 30);
await subscriptionService.activateSubscription(tenantId, endDate, 'basic', adminId);
```

### Task: Extend by 15 days
```javascript
await subscriptionService.extendSubscription(tenantId, 15, adminId);
```

### Task: Check if tenant can write
```javascript
const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
const canWrite = ['TRIAL', 'ACTIVE'].includes(status.tenant.status);
```

### Task: Get days until expiry
```javascript
const status = await subscriptionService.getTenantSubscriptionStatus(tenantId);
const daysLeft = status.subscription.days_left;
```

---

## 📞 Support

- **Email:** billing@track-myads.com
- **Docs:** `SUBSCRIPTION_SYSTEM.md`
- **Examples:** `SUBSCRIPTION_API_EXAMPLES.md`
- **Code:** `src/services/subscriptionService.js`

---

## ⚠️ Important Notes

1. **Never modify tenant state directly** - Always use service methods
2. **Always use UTC** - No local timezones
3. **Check state on login** - Ensures up-to-date state
4. **Use middleware** - Don't duplicate access control logic
5. **Log admin actions** - Audit trail is critical
6. **Test edge cases** - Midnight boundaries, timezone changes

---

## 🎯 Best Practices

✅ **DO:**
- Use service layer for all state changes
- Check subscription status on login
- Use middleware for access control
- Log all admin actions
- Test with UTC timestamps
- Monitor subscription expiries

❌ **DON'T:**
- Update tenant state directly in database
- Use client-side enforcement
- Hardcode dates
- Duplicate access control logic
- Use local timezones
- Skip audit logging

---

## 📚 Full Documentation

For complete documentation, see:
- **`SUBSCRIPTION_SYSTEM.md`** - Full system documentation
- **`SUBSCRIPTION_API_EXAMPLES.md`** - API examples and usage
- **`SUBSCRIPTION_FLOW_DIAGRAMS.md`** - Visual flow diagrams
- **`SUBSCRIPTION_IMPLEMENTATION_SUMMARY.md`** - Implementation overview
