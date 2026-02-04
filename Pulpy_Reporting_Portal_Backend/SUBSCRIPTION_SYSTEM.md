# Subscription & Trial System Documentation

## Overview

Production-grade subscription and trial system for multi-tenant SaaS with subdomain-based tenancy.

**Core Principles:**
- ✅ State-driven (TRIAL, ACTIVE, EXPIRED, SUSPENDED)
- ✅ Deterministic (no ad-hoc logic)
- ✅ Timezone-safe (UTC only)
- ✅ Server-side enforcement
- ✅ Single source of truth
- ✅ Tenant-scoped (not user-scoped)

---

## Architecture

### Tenant States (ENUM)

A tenant can be in exactly **one** state at any time:

| State | Description | Access Level |
|-------|-------------|--------------|
| `TRIAL` | Trial period (10 days from first login) | Full access |
| `ACTIVE` | Active paid subscription | Full access |
| `EXPIRED` | Trial or subscription expired | Read-only access |
| `SUSPENDED` | Manually suspended by admin | Blocked |

### State Transitions

```
TRIAL → ACTIVE    (subscription activated)
TRIAL → EXPIRED   (trial expires after 10 days)
ACTIVE → EXPIRED  (subscription expires)
ACTIVE → SUSPENDED (admin suspends)
EXPIRED → ACTIVE  (subscription renewed)
SUSPENDED → ACTIVE/TRIAL/EXPIRED (admin unsuspends, restored to appropriate state)
```

---

## Database Schema

### Tenants Table (Updated)

```sql
ALTER TABLE `tenants`
  -- State management
  MODIFY COLUMN `status` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') DEFAULT 'TRIAL',
  
  -- Trial tracking (UTC)
  ADD COLUMN `trial_start_at` TIMESTAMP NULL,
  ADD COLUMN `trial_end_at` TIMESTAMP NULL,
  
  -- Subscription tracking (UTC)
  ADD COLUMN `subscription_start_at` TIMESTAMP NULL,
  ADD COLUMN `subscription_end_at` TIMESTAMP NULL,
  ADD COLUMN `subscription_plan` VARCHAR(50) NULL,
  ADD COLUMN `billing_email` VARCHAR(255) NULL;
```

### Subscription History Table (New)

```sql
CREATE TABLE `subscription_history` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` INT(11) NOT NULL,
  `action` ENUM('TRIAL_STARTED', 'TRIAL_EXTENDED', 'SUBSCRIPTION_ACTIVATED', 
                'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION_EXPIRED', 
                'TENANT_SUSPENDED', 'TENANT_UNSUSPENDED', 'TRIAL_RESET'),
  `previous_state` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'),
  `new_state` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'),
  `previous_end_at` TIMESTAMP NULL,
  `new_end_at` TIMESTAMP NULL,
  `admin_id` INT(11) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);
```

---

## Business Rules

### Trial Rules

1. **Trial starts on FIRST LOGIN**, not on tenant creation
2. **Trial duration = 10 days** (hardcoded, deterministic)
3. On first successful login:
   - Set `trial_start_at = now (UTC)`
   - Set `trial_end_at = trial_start_at + 10 days`
   - Set `status = TRIAL`
4. **Trial cannot restart** unless admin explicitly resets it
5. Trial is **tenant-scoped**, not user-scoped

### Subscription Rules

1. Subscription belongs to **tenant**, not individual users
2. On payment or admin activation:
   - Set `subscription_start_at = now (UTC)`
   - Set `subscription_end_at = specified date (UTC)`
   - Set `status = ACTIVE`
3. If `now > subscription_end_at`:
   - State → `EXPIRED`
4. **Subscription takes precedence over trial**
   - If both exist, subscription state is used

### Expiry Rules

1. If `now > trial_end_at` AND no active subscription:
   - State → `EXPIRED`
2. **EXPIRED tenants:**
   - ✅ Can log in
   - ❌ Cannot access core features (enforced by middleware)
   - 👁️ See locked/read-only UI

### Access Control

| State | Login | Read | Write |
|-------|-------|------|-------|
| TRIAL | ✅ | ✅ | ✅ |
| ACTIVE | ✅ | ✅ | ✅ |
| EXPIRED | ✅ | ✅ | ❌ |
| SUSPENDED | ❌ | ❌ | ❌ |

Access control is enforced by a centralized pre-handler (`enforceSubscriptionAccess`) that:
- Allows read-only access for `EXPIRED` tenants
- Blocks all access for `SUSPENDED` tenants
- Skips public/auth endpoints (`/api/auth`, `/api/subscription/status`, `/api/contact`, `/health`)

---

## API Endpoints

### Admin Endpoints (Super Admin Only)

All admin endpoints require authentication via `admin.track-myads.com` subdomain.

#### Get Subscription Status
```http
GET /api/admin/subscriptions/:tenantId
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": 1,
      "name": "Acme Corp",
      "slug": "acme",
      "status": "TRIAL",
      "trial_start_at": "2026-02-04T07:00:00.000Z",
      "trial_end_at": "2026-02-14T07:00:00.000Z",
      "subscription_start_at": null,
      "subscription_end_at": null,
      "subscription_plan": null
    },
    "subscription": {
      "state": "TRIAL",
      "access_level": "full",
      "days_left": 10,
      "end_date": "2026-02-14T07:00:00.000Z",
      "is_warning": false,
      "is_trial": true,
      "is_active": false,
      "is_expired": false,
      "is_suspended": false
    }
  }
}
```

#### Activate Subscription
```http
POST /api/admin/subscriptions/:tenantId/activate
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "end_date": "2026-12-31T23:59:59Z",
  "plan": "pro",
  "billing_email": "billing@acme.com"
}
```

#### Extend Subscription
```http
POST /api/admin/subscriptions/:tenantId/extend
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "days": 30
}
```

#### Set Custom End Date
```http
POST /api/admin/subscriptions/:tenantId/set-end-date
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "end_date": "2027-01-31T23:59:59Z"
}
```

#### Suspend Tenant
```http
POST /api/admin/subscriptions/:tenantId/suspend
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Payment failed"
}
```

#### Unsuspend Tenant
```http
POST /api/admin/subscriptions/:tenantId/unsuspend
Authorization: Bearer <admin_token>
```

#### Reset Trial
```http
POST /api/admin/subscriptions/:tenantId/reset-trial
Authorization: Bearer <admin_token>
```

#### Get Subscription History
```http
GET /api/admin/subscriptions/:tenantId/history?limit=50
Authorization: Bearer <admin_token>
```

### Tenant Endpoints

#### Get Current Tenant Status
```http
GET /api/subscription/status
Authorization: Bearer <tenant_token>
```

Tenant users can view their own subscription status via their subdomain (e.g., `acme.track-myads.com`).

---

## Middleware Usage

### Require Active Subscription

Use this middleware on routes that require full access (write operations):

```javascript
import { requireActiveSubscription } from '../middleware/subscriptionAccess.js';

fastify.post('/api/offers', {
  preHandler: [authenticateAdmin, requireActiveSubscription]
}, createOffer);
```

**Blocks:** EXPIRED, SUSPENDED  
**Allows:** TRIAL, ACTIVE

### Allow Read-Only Access

Use this middleware on routes that should be accessible even when expired:

```javascript
import { allowReadOnlyAccess } from '../middleware/subscriptionAccess.js';

fastify.get('/api/reports', {
  preHandler: [authenticateAdmin, allowReadOnlyAccess]
}, getReports);
```

**Blocks:** SUSPENDED  
**Allows:** TRIAL, ACTIVE, EXPIRED

### Attach Subscription Status

Use this to make subscription status available without enforcing access control:

```javascript
import { attachSubscriptionStatus } from '../middleware/subscriptionAccess.js';

fastify.get('/api/dashboard', {
  preHandler: [authenticateAdmin, attachSubscriptionStatus]
}, async (request, reply) => {
  // Access subscription status
  const status = request.subscriptionStatus;
  
  // Show warning if needed
  if (status.subscription.is_warning) {
    // Display countdown warning
  }
});
```

---

## UI Integration

### Countdown Display

```javascript
// Frontend code example
const getCountdownText = (subscriptionStatus) => {
  const { subscription } = subscriptionStatus;
  
  if (!subscription.days_left) return null;
  
  if (subscription.is_trial) {
    return `Trial: ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} left`;
  } else if (subscription.is_active) {
    return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
  }
  
  return null;
};
```

### Warning Messages

```javascript
const getWarningMessage = (subscriptionStatus) => {
  const { subscription } = subscriptionStatus;
  
  // Expired
  if (subscription.is_expired) {
    return 'Your access has expired. Please contact billing@track-myads.com to continue.';
  }
  
  // Warning (≤ 3 days left)
  if (subscription.is_warning && subscription.days_left !== null) {
    if (subscription.is_trial) {
      return `Trial ending in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} — upgrade to avoid interruption`;
    } else {
      return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
    }
  }
  
  return null;
};
```

### Access Control in UI

```javascript
// Check if write operations are allowed
const canWrite = (subscriptionStatus) => {
  const state = subscriptionStatus.tenant.status;
  return state === 'ACTIVE' || state === 'TRIAL';
};

// Check if read operations are allowed
const canRead = (subscriptionStatus) => {
  const state = subscriptionStatus.tenant.status;
  return state !== 'SUSPENDED';
};

// Example usage
if (!canWrite(subscriptionStatus)) {
  // Disable create/edit/delete buttons
  // Show "Upgrade to continue" message
}
```

---

## Countdown Logic

Days left is calculated as:

```javascript
days_left = Math.ceil((end_time - now) / 86400000)
```

**Rules:**
- Countdown applies to both trial and subscription
- When ≤ 3 days remaining: show warning state in UI
- Clicking countdown opens renewal/billing info
- Always calculated server-side (never client-side)

---

## Cron Job Setup

To automatically update expired tenant states, set up a cron job:

```bash
# Run every hour
0 * * * * mysql -u user -p database -e "CALL update_all_tenant_states();"
```

Or use a Node.js cron job:

```javascript
import cron from 'node-cron';
import pool from './db/connection.js';

// Run every hour
cron.schedule('0 * * * *', async () => {
  try {
    await pool.query('CALL update_all_tenant_states()');
    console.log('Tenant states updated');
  } catch (error) {
    console.error('Error updating tenant states:', error);
  }
});
```

---

## Testing

Run the comprehensive test suite:

```bash
npm test src/tests/subscription.test.js
```

**Test Coverage:**
- ✅ Trial starts on first login
- ✅ Trial expires exactly after 10 days
- ✅ Subscription activation
- ✅ Subscription expiry
- ✅ Admin extension
- ✅ Midnight boundary (UTC)
- ✅ Tenant isolation
- ✅ Countdown accuracy
- ✅ State transitions
- ✅ Subscription history audit trail

---

## Migration Steps

1. **Run the database migration:**
   ```bash
   mysql -u user -p database < src/db/migrations/012_add_subscription_trial_system.sql
   ```

2. **Verify migration:**
   ```sql
   DESCRIBE tenants;
   DESCRIBE subscription_history;
   ```

3. **Update existing tenants:**
   ```sql
   -- Set all existing tenants to TRIAL state
   UPDATE tenants 
   SET status = 'TRIAL' 
   WHERE trial_start_at IS NULL AND subscription_start_at IS NULL;
   ```

4. **Restart the backend:**
   ```bash
   pm2 restart all
   ```

5. **Test the system:**
   - Login as a tenant user → trial should start
   - Check subscription status via API
   - Test admin endpoints

---

## Security Considerations

1. **No client-side enforcement** - All access control is server-side
2. **No hardcoded dates** - All dates are calculated dynamically
3. **UTC timezone only** - Prevents timezone-related bugs
4. **Audit trail** - All subscription changes are logged
5. **Tenant isolation** - Users can only access their own tenant's data
6. **State-driven** - No scattered "if trial / if paid" checks

---

## Admin Capabilities

Admins can:
- ✅ View subscription status for any tenant
- ✅ Activate subscription with custom end date
- ✅ Extend subscription by N days
- ✅ Set custom subscription expiry date
- ✅ Suspend / Unsuspend tenant
- ✅ Reset trial manually (special cases)
- ✅ View complete subscription history

All admin actions:
- Update state and dates (deterministic)
- Are logged in subscription_history
- Include admin_id for accountability

---

## Troubleshooting

### Trial not starting on login

**Check:**
1. Is the tenant_id correctly resolved from subdomain?
2. Are the subscription service methods being called?
3. Check logs for errors in `subscriptionService.startTrial()`

### State not updating

**Check:**
1. Is the cron job running?
2. Run manually: `CALL update_all_tenant_states();`
3. Check `subscription_history` for state change events

### Timezone issues

**Check:**
1. All timestamps are stored in UTC
2. Database timezone is set to UTC: `SET time_zone = '+00:00'`
3. Application uses `new Date()` (UTC) not local time

---

## Best Practices

1. **Always use the service layer** - Never update tenant state directly in controllers
2. **Check subscription status on login** - Ensures state is up-to-date
3. **Use middleware for access control** - Don't duplicate logic in routes
4. **Log all admin actions** - Audit trail is critical
5. **Test edge cases** - Midnight boundaries, timezone changes, etc.
6. **Monitor subscription expiries** - Set up alerts for tenants expiring soon

---

## Future Enhancements

Potential improvements:
- [ ] Webhook notifications for subscription events
- [ ] Email notifications for trial/subscription expiry
- [ ] Payment gateway integration (Stripe, PayPal)
- [ ] Self-service subscription management UI
- [ ] Usage-based billing
- [ ] Multiple subscription tiers with feature flags
- [ ] Grace period after expiry (e.g., 7 days)
- [ ] Automatic suspension after X days expired

---

## Support

For questions or issues:
- Email: billing@track-myads.com
- Documentation: This file
- Code: `src/services/subscriptionService.js`
- Tests: `src/tests/subscription.test.js`
