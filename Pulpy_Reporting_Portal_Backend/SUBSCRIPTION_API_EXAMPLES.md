# Subscription System - API Examples

This file contains practical examples of using the subscription system API.

## Admin Examples

### 1. Check Tenant Subscription Status

```bash
curl -X GET \
  'http://admin.track-myads.com/api/admin/subscriptions/1' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
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

---

### 2. Activate Subscription (30 days)

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/activate' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "end_date": "2026-03-06T23:59:59Z",
    "plan": "pro",
    "billing_email": "billing@acme.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription activated successfully",
  "data": {
    "tenant": {
      "id": 1,
      "status": "ACTIVE",
      "subscription_start_at": "2026-02-04T07:00:00.000Z",
      "subscription_end_at": "2026-03-06T23:59:59.000Z",
      "subscription_plan": "pro"
    },
    "subscription": {
      "state": "ACTIVE",
      "access_level": "full",
      "days_left": 30,
      "is_active": true
    }
  }
}
```

---

### 3. Extend Subscription by 15 Days

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/extend' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "days": 15
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription extended by 15 days",
  "data": {
    "tenant": {
      "id": 1,
      "status": "ACTIVE",
      "subscription_end_at": "2026-03-21T23:59:59.000Z"
    },
    "subscription": {
      "days_left": 45
    }
  }
}
```

---

### 4. Set Custom End Date

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/set-end-date' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "end_date": "2026-12-31T23:59:59Z"
  }'
```

---

### 5. Suspend Tenant

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/suspend' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "Payment failed - credit card declined"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Tenant suspended",
  "data": {
    "tenant": {
      "id": 1,
      "status": "SUSPENDED"
    },
    "subscription": {
      "state": "SUSPENDED",
      "access_level": "blocked",
      "is_suspended": true
    }
  }
}
```

---

### 6. Unsuspend Tenant

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/unsuspend' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

**Response:**
```json
{
  "success": true,
  "message": "Tenant unsuspended",
  "data": {
    "tenant": {
      "id": 1,
      "status": "ACTIVE"
    },
    "subscription": {
      "state": "ACTIVE",
      "access_level": "full"
    }
  }
}
```

---

### 7. Reset Trial (Special Cases)

```bash
curl -X POST \
  'http://admin.track-myads.com/api/admin/subscriptions/1/reset-trial' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

**Response:**
```json
{
  "success": true,
  "message": "Trial reset successfully",
  "data": {
    "tenant": {
      "id": 1,
      "status": "TRIAL",
      "trial_start_at": "2026-02-04T07:00:00.000Z",
      "trial_end_at": "2026-02-14T07:00:00.000Z"
    },
    "subscription": {
      "state": "TRIAL",
      "days_left": 10,
      "is_trial": true
    }
  }
}
```

---

### 8. Get Subscription History

```bash
curl -X GET \
  'http://admin.track-myads.com/api/admin/subscriptions/1/history?limit=10' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_id": 1,
    "history": [
      {
        "id": 5,
        "tenant_id": 1,
        "action": "SUBSCRIPTION_EXTENDED",
        "previous_state": "ACTIVE",
        "new_state": "ACTIVE",
        "previous_end_at": "2026-03-06T23:59:59.000Z",
        "new_end_at": "2026-03-21T23:59:59.000Z",
        "admin_id": 1,
        "admin_name": "Super Admin",
        "admin_email": "admin@track-myads.com",
        "notes": "Subscription extended by 15 days",
        "created_at": "2026-02-04T08:00:00.000Z"
      },
      {
        "id": 4,
        "tenant_id": 1,
        "action": "SUBSCRIPTION_ACTIVATED",
        "previous_state": "TRIAL",
        "new_state": "ACTIVE",
        "new_end_at": "2026-03-06T23:59:59.000Z",
        "admin_id": 1,
        "notes": "Subscription activated. Plan: pro",
        "created_at": "2026-02-04T07:30:00.000Z"
      },
      {
        "id": 3,
        "tenant_id": 1,
        "action": "TRIAL_STARTED",
        "previous_state": "TRIAL",
        "new_state": "TRIAL",
        "new_end_at": "2026-02-14T07:00:00.000Z",
        "admin_id": null,
        "notes": "Trial started on first login. Duration: 10 days",
        "created_at": "2026-02-04T07:00:00.000Z"
      }
    ]
  }
}
```

---

## Tenant Examples

### Get Current Tenant Status

```bash
# Tenant user accessing their own subscription status
curl -X GET \
  'http://acme.track-myads.com/api/subscription/status' \
  -H 'Authorization: Bearer TENANT_USER_TOKEN'
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
      "status": "ACTIVE",
      "subscription_end_at": "2026-03-21T23:59:59.000Z",
      "subscription_plan": "pro"
    },
    "subscription": {
      "state": "ACTIVE",
      "access_level": "full",
      "days_left": 45,
      "is_active": true
    }
  }
}
```

---

## Error Responses

### Expired Tenant Accessing Protected Resource

```bash
curl -X POST \
  'http://acme.track-myads.com/api/offers' \
  -H 'Authorization: Bearer TENANT_USER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "New Offer"
  }'
```

**Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "Subscription Expired",
  "message": "Your access has expired. Please contact billing@track-myads.com to continue.",
  "subscription_status": "expired",
  "billing_email": "billing@track-myads.com"
}
```

---

### Suspended Tenant Login Attempt

```bash
curl -X POST \
  'http://acme.track-myads.com/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@acme.com",
    "password": "password123"
  }'
```

**Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "Account Suspended",
  "message": "Your account has been suspended. Please contact billing@track-myads.com for assistance.",
  "subscription_status": "suspended"
}
```

---

## JavaScript/Node.js Examples

### Admin SDK Example

```javascript
import axios from 'axios';

class SubscriptionAdmin {
  constructor(adminToken) {
    this.client = axios.create({
      baseURL: 'http://admin.track-myads.com/api',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getStatus(tenantId) {
    const { data } = await this.client.get(`/admin/subscriptions/${tenantId}`);
    return data.data;
  }

  async activateSubscription(tenantId, endDate, plan = 'basic') {
    const { data } = await this.client.post(
      `/admin/subscriptions/${tenantId}/activate`,
      { end_date: endDate, plan }
    );
    return data.data;
  }

  async extendSubscription(tenantId, days) {
    const { data } = await this.client.post(
      `/admin/subscriptions/${tenantId}/extend`,
      { days }
    );
    return data.data;
  }

  async suspendTenant(tenantId, reason) {
    const { data } = await this.client.post(
      `/admin/subscriptions/${tenantId}/suspend`,
      { reason }
    );
    return data.data;
  }

  async unsuspendTenant(tenantId) {
    const { data } = await this.client.post(
      `/admin/subscriptions/${tenantId}/unsuspend`
    );
    return data.data;
  }

  async getHistory(tenantId, limit = 50) {
    const { data } = await this.client.get(
      `/admin/subscriptions/${tenantId}/history?limit=${limit}`
    );
    return data.data.history;
  }
}

// Usage
const admin = new SubscriptionAdmin('YOUR_ADMIN_TOKEN');

// Check status
const status = await admin.getStatus(1);
console.log('Tenant status:', status.tenant.status);
console.log('Days left:', status.subscription.days_left);

// Activate subscription for 30 days
const endDate = new Date();
endDate.setDate(endDate.getDate() + 30);
await admin.activateSubscription(1, endDate.toISOString(), 'pro');

// Extend by 15 days
await admin.extendSubscription(1, 15);

// Get history
const history = await admin.getHistory(1);
console.log('Recent changes:', history);
```

---

### Tenant SDK Example

```javascript
import axios from 'axios';

class SubscriptionClient {
  constructor(tenantSlug, userToken) {
    this.client = axios.create({
      baseURL: `http://${tenantSlug}.track-myads.com/api`,
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getStatus() {
    const { data } = await this.client.get('/subscription/status');
    return data.data;
  }

  async checkAccess() {
    const status = await this.getStatus();
    return {
      canWrite: ['TRIAL', 'ACTIVE'].includes(status.tenant.status),
      canRead: status.tenant.status !== 'SUSPENDED',
      isExpired: status.subscription.is_expired,
      daysLeft: status.subscription.days_left,
      warning: this.getWarning(status)
    };
  }

  getWarning(status) {
    const { subscription } = status;
    
    if (subscription.is_expired) {
      return 'Your access has expired. Please contact billing@track-myads.com to continue.';
    }
    
    if (subscription.is_warning && subscription.days_left !== null) {
      if (subscription.is_trial) {
        return `Trial ending in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} — upgrade to avoid interruption`;
      } else {
        return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
      }
    }
    
    return null;
  }
}

// Usage
const client = new SubscriptionClient('acme', 'USER_TOKEN');

// Check subscription status
const status = await client.getStatus();
console.log('Status:', status.tenant.status);
console.log('Days left:', status.subscription.days_left);

// Check access permissions
const access = await client.checkAccess();
if (!access.canWrite) {
  console.log('Write access disabled');
  console.log('Warning:', access.warning);
}
```

---

## Frontend React Example

```jsx
import React, { useEffect, useState } from 'react';
import { Alert, Badge } from 'react-bootstrap';

function SubscriptionBanner() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/subscription/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setSubscription(data.data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !subscription) return null;

  const { subscription: sub } = subscription;

  // Show warning banner
  if (sub.is_warning || sub.is_expired) {
    return (
      <Alert variant={sub.is_expired ? 'danger' : 'warning'}>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            {sub.is_expired ? (
              <strong>Your access has expired.</strong>
            ) : sub.is_trial ? (
              <strong>Trial ending in {sub.days_left} day{sub.days_left !== 1 ? 's' : ''}</strong>
            ) : (
              <strong>Subscription expires in {sub.days_left} day{sub.days_left !== 1 ? 's' : ''}</strong>
            )}
            {' '}
            {sub.is_expired ? (
              <span>Please contact <a href="mailto:billing@track-myads.com">billing@track-myads.com</a> to continue.</span>
            ) : (
              <span>— upgrade to avoid interruption</span>
            )}
          </div>
          <button className="btn btn-primary btn-sm">
            {sub.is_trial ? 'Upgrade Now' : 'Renew Subscription'}
          </button>
        </div>
      </Alert>
    );
  }

  // Show countdown badge (always visible)
  if (sub.days_left !== null) {
    return (
      <div className="subscription-countdown">
        <Badge bg={sub.is_trial ? 'info' : 'secondary'}>
          {sub.is_trial ? 'Trial' : 'Subscription'}: {sub.days_left} day{sub.days_left !== 1 ? 's' : ''} left
        </Badge>
      </div>
    );
  }

  return null;
}

export default SubscriptionBanner;
```

---

## Testing Examples

### Manual Testing Script

```bash
#!/bin/bash

# Configuration
ADMIN_TOKEN="your_admin_token"
TENANT_ID=1
BASE_URL="http://admin.track-myads.com/api"

echo "=== Subscription System Test ==="

# 1. Check initial status
echo -e "\n1. Checking initial status..."
curl -s -X GET "${BASE_URL}/admin/subscriptions/${TENANT_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data.tenant.status'

# 2. Activate subscription
echo -e "\n2. Activating subscription..."
END_DATE=$(date -u -d "+30 days" +"%Y-%m-%dT23:59:59Z")
curl -s -X POST "${BASE_URL}/admin/subscriptions/${TENANT_ID}/activate" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"end_date\": \"${END_DATE}\", \"plan\": \"pro\"}" | jq '.success'

# 3. Verify activation
echo -e "\n3. Verifying activation..."
curl -s -X GET "${BASE_URL}/admin/subscriptions/${TENANT_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data.tenant.status'

# 4. Extend subscription
echo -e "\n4. Extending subscription by 15 days..."
curl -s -X POST "${BASE_URL}/admin/subscriptions/${TENANT_ID}/extend" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"days": 15}' | jq '.success'

# 5. Check history
echo -e "\n5. Checking subscription history..."
curl -s -X GET "${BASE_URL}/admin/subscriptions/${TENANT_ID}/history?limit=5" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.data.history | length'

echo -e "\n=== Test Complete ==="
```

---

## Common Workflows

### Workflow 1: New Tenant Onboarding

1. Tenant registers → tenant created with `status = 'TRIAL'`
2. User logs in for first time → trial starts (10 days)
3. User receives trial countdown in UI
4. After 3 days → warning banner appears
5. Trial expires → access becomes read-only
6. Admin activates subscription → full access restored

### Workflow 2: Subscription Renewal

1. Subscription nearing expiry (≤ 3 days)
2. Warning banner shown to user
3. User contacts billing
4. Admin extends subscription by 30 days
5. User continues with full access

### Workflow 3: Payment Failure

1. Payment fails
2. Admin suspends tenant
3. User cannot log in
4. User contacts billing
5. Payment resolved
6. Admin unsuspends tenant
7. User can log in again

---

## Postman Collection

Import this JSON into Postman for easy testing:

```json
{
  "info": {
    "name": "Subscription System API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Subscription Status",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{admin_token}}"
          }
        ],
        "url": {
          "raw": "{{base_url}}/api/admin/subscriptions/{{tenant_id}}",
          "host": ["{{base_url}}"],
          "path": ["api", "admin", "subscriptions", "{{tenant_id}}"]
        }
      }
    },
    {
      "name": "Activate Subscription",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{admin_token}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"end_date\": \"2026-12-31T23:59:59Z\",\n  \"plan\": \"pro\"\n}"
        },
        "url": {
          "raw": "{{base_url}}/api/admin/subscriptions/{{tenant_id}}/activate",
          "host": ["{{base_url}}"],
          "path": ["api", "admin", "subscriptions", "{{tenant_id}}", "activate"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://admin.track-myads.com"
    },
    {
      "key": "admin_token",
      "value": "your_admin_token_here"
    },
    {
      "key": "tenant_id",
      "value": "1"
    }
  ]
}
```
