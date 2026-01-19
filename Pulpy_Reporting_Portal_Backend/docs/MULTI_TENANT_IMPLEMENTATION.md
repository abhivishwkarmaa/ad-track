# Multi-Tenant Implementation Guide

## Overview

This document describes the multi-tenant architecture implementation for the ad tracking platform. The system now supports multiple tenants, each with their own subdomain, fully isolated data, and shared backend/database infrastructure.

## Architecture

### Subdomain-Based Tenant Resolution

- **Tenant UI**: `{tenant-slug}.track-myads.com` (e.g., `owner1.track-myads.com`)
- **Admin Panel**: `admin.track-myads.com` (super admin only)
- **API**: `api.track-myads.com` (can accept tenant via header)

### Database Schema Changes

#### New Table: `tenants`
```sql
CREATE TABLE tenants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  status ENUM('active','suspended') DEFAULT 'active',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Added `tenant_id` Column To:
- `admin_users` - Links users to tenants (NULL = super admin)
- `advertisers` - Scopes advertisers by tenant
- `offers` - Scopes offers by tenant
- `publishers` - Scopes publishers by tenant
- `clicks` - Scopes clicks by tenant
- `conversions` - Scopes conversions by tenant
- `impressions` - Scopes impressions by tenant
- `publisher_offers` - Scopes assignments by tenant
- `daily_offer_stats` - Scopes stats by tenant
- `affiliate_postback_logs` - Scopes logs by tenant

## Request Lifecycle

1. **Request arrives** at `owner1.track-myads.com/click?offer_id=123&pub_id=456`
2. **Tenant middleware** extracts `owner1` from subdomain
3. **Tenant lookup** queries `tenants` table by slug
4. **Tenant context** attached to request (`request.tenant`, `request.tenantId`)
5. **All queries** automatically scoped by `tenant_id`
6. **Response** returned with tenant-isolated data

## Key Components

### 1. Tenant Resolution Middleware (`src/middleware/tenant.js`)

- Extracts tenant from subdomain
- Validates tenant exists and is active
- Attaches tenant context to request
- Handles special subdomains (admin, api)

### 2. Authentication Updates (`src/middleware/auth.js`)

- JWT tokens now include `tenant_id`
- Tenant admins can only access their tenant's data
- Super admins (no tenant_id) can access all tenants (via admin subdomain)

### 3. Tenant Management (`src/controllers/tenantController.js`)

- CRUD operations for tenants
- Only accessible from `admin.track-myads.com` by super admin
- Can create tenant admin users during tenant creation

### 4. Service Layer Updates

All services must:
- Accept `tenantId` parameter or get from request
- Add `tenant_id` to WHERE clauses
- Include `tenant_id` in INSERT statements
- Verify tenant ownership before operations

## Migration Steps

### Step 1: Run Database Migration

```bash
mysql -u username -p database_name < src/db/migrations/001_add_multi_tenant_support.sql
```

### Step 2: Create Default Tenant (Optional)

If you have existing data, create a default tenant:

```sql
INSERT INTO tenants (name, slug, status) VALUES ('Default Tenant', 'default', 'active');
SET @default_tenant_id = LAST_INSERT_ID();

-- Assign existing data to default tenant
UPDATE admin_users SET tenant_id = @default_tenant_id WHERE tenant_id IS NULL;
UPDATE offers SET tenant_id = @default_tenant_id WHERE tenant_id IS NULL;
UPDATE publishers SET tenant_id = @default_tenant_id WHERE tenant_id IS NULL;
-- ... repeat for other tables
```

### Step 3: Update Services

Services need to be updated to:
1. Get `tenantId` from request context
2. Add `tenant_id` to all queries
3. Include `tenant_id` in INSERT statements

**Example:**
```javascript
// Before
const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);

// After
const tenantId = getTenantIdFromRequest(request);
const [rows] = await pool.query(
  'SELECT * FROM offers WHERE id = ? AND tenant_id = ?',
  [id, tenantId]
);
```

### Step 4: Update Tracking Endpoints

Tracking endpoints (`/click`, `/postback`) must:
- Resolve tenant from subdomain
- Verify offer/publisher belong to tenant
- Include `tenant_id` when inserting clicks/conversions

### Step 5: Update Frontend

Frontend must:
- Detect subdomain and set tenant context
- Include tenant info in API calls
- Handle tenant-specific routing

## Tenant Creation Flow

1. **Super Admin** logs into `admin.track-myads.com`
2. **Creates tenant** via `/api/admin/tenants` endpoint
3. **System creates**:
   - Tenant record in `tenants` table
   - Tenant admin user (optional)
4. **Tenant Admin** logs into `{tenant-slug}.track-myads.com`
5. **Can manage**:
   - Offers (only their tenant's)
   - Publishers (only their tenant's)
   - Reports (only their tenant's)

## Security Considerations

1. **Tenant Isolation**: All queries MUST include `tenant_id` filter
2. **Subdomain Validation**: Only valid tenant slugs are accepted
3. **JWT Verification**: Token `tenant_id` must match request tenant
4. **Admin Access**: Super admins can only access via `admin.track-myads.com`

## Testing Checklist

- [ ] Tenant resolution from subdomain works
- [ ] Tracking endpoints resolve tenant correctly
- [ ] Database queries are scoped by tenant_id
- [ ] Tenant admins can only see their data
- [ ] Super admins can manage all tenants
- [ ] Existing tracking URLs still work (with tenant context)
- [ ] Postback URLs work with tenant isolation

## Deployment

1. **DNS**: Configure wildcard DNS `*.track-myads.com` → backend server
2. **Backend**: Deploy updated code with tenant middleware
3. **Database**: Run migration script
4. **Frontend**: Deploy updated frontend with subdomain detection
5. **Testing**: Verify tenant isolation works correctly

## Rollback Plan

If issues occur:
1. Remove tenant middleware from server.js
2. Set all `tenant_id` columns to NULL (if needed)
3. Revert service changes (remove tenant_id filters)
4. Restore previous frontend version

## API Endpoints

### Tenant Management (Admin Only)

- `POST /api/admin/tenants` - Create tenant
- `GET /api/admin/tenants` - List all tenants
- `GET /api/admin/tenants/:id` - Get tenant details
- `PATCH /api/admin/tenants/:id` - Update tenant
- `DELETE /api/admin/tenants/:id` - Delete/suspend tenant

### Tracking (Tenant-Scoped)

- `GET /click?offer_id=X&pub_id=Y` - Track click (tenant from subdomain)
- `GET /postback?rcid=X` - Handle conversion (tenant from subdomain)

## Notes

- **Tenants are NOT users** - They are business entities/companies
- **Only Super Admin creates tenants** - Via admin panel
- **Tenant Admin manages their tenant** - Via tenant subdomain
- **Tracking URLs unchanged** - Subdomain provides tenant context
- **Same backend/database** - No duplication required
