# Quick Test Guide - Tenant Routes

## 🚀 Quick Start

### Step 1: Ensure Backend is Running

```bash
cd Pulpy_Reporting_Portal_Backend
npm start
# Server should be running on http://localhost:5001
```

### Step 2: Configure Admin Subdomain (Development)

Add to `/etc/hosts`:
```
127.0.0.1 admin.localhost
```

### Step 3: Run the Test Script

```bash
# Set your admin credentials (optional, defaults provided)
export ADMIN_EMAIL=your-admin@email.com
export ADMIN_PASSWORD=your-password

# Run tests
node src/tests/tenant-routes.test.js
```

---

## 📋 What Gets Tested

The test script automatically tests:

1. ✅ **Login** - Authenticate as super admin
2. ✅ **Create Tenant** - Create a new tenant with admin user
3. ✅ **Get All Tenants** - List all tenants
4. ✅ **Get Single Tenant** - Get tenant by ID
5. ✅ **Update Tenant** - Update tenant name/status
6. ✅ **Get Tenant Metrics** - Get performance metrics
7. ✅ **Suspend Tenant** - Suspend tenant access
8. ✅ **Resume Tenant** - Resume tenant access
9. ✅ **Delete Tenant** - Soft delete tenant
10. ✅ **Validations** - Test input validation
11. ✅ **Access Control** - Test authentication requirements

---

## 🎯 Expected Output

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

## 🔧 Troubleshooting

### Issue: "Cannot connect to server"

**Solution**: Make sure backend is running on port 5001
```bash
# Check if server is running
curl http://localhost:5001/health
```

### Issue: "Unauthorized" or "403 Forbidden"

**Solutions**:
1. Check admin credentials are correct
2. Ensure user is a super admin (`tenant_id = NULL`)
3. Verify Host header is set to `admin.localhost`

### Issue: "Tenant Not Found" (404)

**Solution**: This is normal if testing on a fresh database. The test will create a tenant first.

### Issue: "Duplicate slug" (409)

**Solution**: The test uses a timestamp-based slug. If you run tests multiple times quickly, wait a moment or the test will handle it.

---

## 📝 Manual Testing

If you prefer to test manually, see `TEST_TENANT_ROUTES.md` for cURL examples.

---

## ✅ Success Criteria

All tests should pass if:
- ✅ Backend server is running
- ✅ Database migrations are applied
- ✅ Admin subdomain is configured
- ✅ Super admin user exists
- ✅ All middleware is working correctly

---

**Ready to test! Run: `node src/tests/tenant-routes.test.js`**
