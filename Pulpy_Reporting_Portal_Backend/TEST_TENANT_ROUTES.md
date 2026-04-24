# Testing Tenant Routes

## Quick Start

### Option 1: Using the Test Script

```bash
cd Pulpy_Reporting_Portal_Backend

# Install node-fetch if not already installed
npm install node-fetch

# Run the test script
node src/tests/tenant-routes.test.js
```

### Option 2: Using cURL

See the examples below for manual testing with cURL.

### Option 3: Using Postman/Insomnia

Import the endpoints and test manually.

---

## Prerequisites

1. **Backend server running** on `localhost:5001`
2. **Admin subdomain configured**:
   - Development: Add to `/etc/hosts`: `127.0.0.1 admin.localhost`
   - Production: Access via `admin.track-myads.com`
3. **Super admin credentials**:
   - Email: `admin@example.com` (or your admin email)
   - Password: Your admin password
4. **Database migrations run**:
   - `001_add_multi_tenant_support.sql` must be executed

---

## Environment Variables

You can customize the test script with environment variables:

```bash
export API_URL=http://localhost:5001
export ADMIN_SUBDOMAIN=admin.localhost:5001
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=your-password

node src/tests/tenant-routes.test.js
```

---

## Manual Testing with cURL

### 1. Login as Super Admin

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Host: admin.localhost" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

**Save the token** from the response for subsequent requests.

### 2. Create Tenant

```bash
curl -X POST http://localhost:5001/api/admin/tenants \
  -H "Content-Type: application/json" \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Acme Corporation",
    "slug": "acme",
    "status": "active",
    "adminEmail": "admin@acme.com",
    "adminName": "Acme Admin",
    "adminPassword": "securepass123"
  }'
```

### 3. Get All Tenants

```bash
curl -X GET "http://localhost:5001/api/admin/tenants?page=1&limit=10" \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Get Single Tenant

```bash
curl -X GET http://localhost:5001/api/admin/tenants/1 \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 5. Update Tenant

```bash
curl -X PATCH http://localhost:5001/api/admin/tenants/1 \
  -H "Content-Type: application/json" \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Updated Tenant Name",
    "status": "active"
  }'
```

### 6. Get Tenant Metrics

```bash
curl -X GET "http://localhost:5001/api/admin/tenants/1/metrics?date_from=2026-01-01&date_to=2026-01-31" \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 7. Suspend Tenant

```bash
curl -X POST http://localhost:5001/api/admin/tenants/1/suspend \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 8. Resume Tenant

```bash
curl -X POST http://localhost:5001/api/admin/tenants/1/resume \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 9. Delete Tenant (Soft Delete)

```bash
curl -X DELETE http://localhost:5001/api/admin/tenants/1 \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 10. Delete Tenant (Hard Delete)

```bash
curl -X DELETE "http://localhost:5001/api/admin/tenants/1?hardDelete=true" \
  -H "Host: admin.localhost" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Test Script Output

The test script will output:

```
============================================================
🧪 TENANT ROUTES TEST SUITE
============================================================

🧪 Test 1: Login as Super Admin
✅ Login successful. Token received.
ℹ️  User: Admin User (admin)

------------------------------------------------------------
🧪 Test 2: Create Tenant
✅ Tenant created successfully!
ℹ️  Tenant ID: 1
ℹ️  Tenant Name: Test Tenant 1234567890
ℹ️  Tenant Slug: test-tenant-1234567890
ℹ️  Subdomain: test-tenant-1234567890.track-myads.com

... (more tests)

============================================================
📊 TEST SUMMARY
============================================================
✅ Passed: 11
❌ Failed: 0
⏭️  Skipped: 0
============================================================

✅ All tests passed! 🎉
```

---

## Expected Responses

### Success Response Format

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    "id": 1,
    "name": "Tenant Name",
    "slug": "tenant-slug",
    "status": "active",
    "created_at": "2026-01-14T10:00:00.000Z"
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Error message description"
}
```

---

## Common Issues

### Issue 1: "Tenant Not Found" (404)

**Cause**: Tenant ID doesn't exist or wrong ID used.

**Solution**: Verify tenant ID exists by listing all tenants first.

### Issue 2: "Unauthorized" (401/403)

**Cause**: 
- Missing or invalid JWT token
- Not accessing via admin subdomain
- User is not a super admin

**Solution**:
- Ensure you're logged in and have a valid token
- Access via `admin.localhost` or `admin.track-myads.com`
- Verify user has `tenant_id = NULL` (super admin)

### Issue 3: "Tenant with this slug already exists" (409)

**Cause**: Trying to create tenant with duplicate slug.

**Solution**: Use a unique slug or delete the existing tenant first.

### Issue 4: "Validation Error" (400)

**Cause**: Invalid input data (missing required fields, invalid format).

**Solution**: Check request body matches required schema.

### Issue 5: "Host header not preserved"

**Cause**: Not using admin subdomain in Host header.

**Solution**: Ensure Host header is set to `admin.localhost` or `admin.track-myads.com`.

---

## Testing Checklist

- [ ] Login as super admin works
- [ ] Create tenant works
- [ ] Get all tenants works
- [ ] Get single tenant works
- [ ] Update tenant works
- [ ] Get tenant metrics works
- [ ] Suspend tenant works
- [ ] Resume tenant works
- [ ] Delete tenant works (soft delete)
- [ ] Validation errors work correctly
- [ ] Access control works (unauthorized requests rejected)
- [ ] Admin subdomain requirement enforced

---

## Integration with Frontend

After testing the API endpoints, test the frontend:

1. **Login via admin subdomain**: `http://admin.localhost:5173`
2. **Navigate to Tenants menu** (should be visible for super admin)
3. **Test all CRUD operations** through the UI
4. **Verify data isolation** (tenant admins cannot see tenant management)

---

## Next Steps

1. Run the test script to verify all endpoints
2. Test manually with cURL for specific scenarios
3. Test through the frontend UI
4. Verify tenant isolation works correctly
5. Test suspended tenant access blocking

---

**Happy Testing! 🚀**
