/**
 * Tenant Routes Test Script
 * 
 * Tests all tenant management endpoints
 * 
 * Usage:
 *   node src/tests/tenant-routes.test.js
 * 
 * Requirements:
 *   - Backend server running on localhost:5001
 *   - Admin subdomain configured (admin.localhost or admin.track-myads.com)
 *   - Super admin user credentials
 */

import axios from 'axios';

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5001';
const ADMIN_SUBDOMAIN = process.env.ADMIN_SUBDOMAIN || 'admin.localhost:5001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Test state
let authToken = null;
let createdTenantId = null;
let testTenantSlug = `test-tenant-${Date.now()}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logTest(message) {
  log(`🧪 ${message}`, 'yellow');
}

/**
 * Make API request with proper headers
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Host': ADMIN_SUBDOMAIN,
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const config = {
      method: options.method || 'GET',
      url,
      headers,
      validateStatus: () => true, // Don't throw on any status code
    };

    if (options.body) {
      config.data = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    }

    const response = await axios(config);

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      data: response.data,
    };
  } catch (error) {
    return {
      status: error.response?.status || 0,
      ok: false,
      error: error.message,
      data: error.response?.data || { error: error.message },
    };
  }
}

/**
 * Test 1: Login as Super Admin
 */
async function testLogin() {
  logTest('Test 1: Login as Super Admin');

  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  if (response.ok && response.data.success && response.data.data.token) {
    authToken = response.data.data.token;
    logSuccess(`Login successful. Token received.`);
    logInfo(`User: ${response.data.data.name} (${response.data.data.role})`);
    return true;
  } else {
    logError(`Login failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    return false;
  }
}

/**
 * Test 2: Create Tenant
 */
async function testCreateTenant() {
  logTest('Test 2: Create Tenant');

  const tenantData = {
    name: `Test Tenant ${Date.now()}`,
    slug: testTenantSlug,
    status: 'active',
    adminEmail: `admin@${testTenantSlug}.com`,
    adminName: 'Test Admin',
    adminPassword: 'testpass123',
  };

  const response = await apiRequest('/api/admin/tenants', {
    method: 'POST',
    body: JSON.stringify(tenantData),
  });

  if (response.ok && response.data.success) {
    createdTenantId = response.data.data.tenant.id;
    logSuccess(`Tenant created successfully!`);
    logInfo(`Tenant ID: ${createdTenantId}`);
    logInfo(`Tenant Name: ${response.data.data.tenant.name}`);
    logInfo(`Tenant Slug: ${response.data.data.tenant.slug}`);
    logInfo(`Subdomain: ${response.data.data.tenant.slug}.track-myads.com`);
    return true;
  } else {
    logError(`Create tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    return false;
  }
}

/**
 * Test 3: Get All Tenants
 */
async function testGetAllTenants() {
  logTest('Test 3: Get All Tenants');

  const response = await apiRequest('/api/admin/tenants?page=1&limit=10');

  if (response.ok && response.data.success) {
    const tenants = response.data.data || [];
    logSuccess(`Retrieved ${tenants.length} tenants`);
    if (tenants.length > 0) {
      logInfo(`First tenant: ${tenants[0].name} (${tenants[0].slug})`);
    }
    return true;
  } else {
    logError(`Get tenants failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 4: Get Single Tenant
 */
async function testGetTenant() {
  logTest('Test 4: Get Single Tenant');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}`);

  if (response.ok && response.data.success) {
    const tenant = response.data.data;
    logSuccess(`Retrieved tenant: ${tenant.name}`);
    logInfo(`ID: ${tenant.id}`);
    logInfo(`Slug: ${tenant.slug}`);
    logInfo(`Status: ${tenant.status}`);
    return true;
  } else {
    logError(`Get tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 5: Update Tenant
 */
async function testUpdateTenant() {
  logTest('Test 5: Update Tenant');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const updateData = {
    name: `Updated Test Tenant ${Date.now()}`,
  };

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  });

  if (response.ok && response.data.success) {
    logSuccess(`Tenant updated successfully!`);
    logInfo(`New name: ${response.data.data.name}`);
    return true;
  } else {
    logError(`Update tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 6: Get Tenant Metrics
 */
async function testGetTenantMetrics() {
  logTest('Test 6: Get Tenant Metrics');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}/metrics`);

  if (response.ok && response.data.success) {
    const metrics = response.data.data.metrics || {};
    logSuccess(`Retrieved tenant metrics`);
    logInfo(`Total Clicks: ${metrics.total_clicks || 0}`);
    logInfo(`Total Conversions: ${metrics.total_conversions || 0}`);
    logInfo(`Total Revenue: $${metrics.total_revenue || 0}`);
    logInfo(`Active Offers: ${metrics.active_offers || 0}`);
    logInfo(`Active Publishers: ${metrics.active_publishers || 0}`);
    return true;
  } else {
    logError(`Get metrics failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 7: Suspend Tenant
 */
async function testSuspendTenant() {
  logTest('Test 7: Suspend Tenant');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}/suspend`, {
    method: 'POST',
  });

  if (response.ok && response.data.success) {
    logSuccess(`Tenant suspended successfully!`);
    logInfo(`Status: ${response.data.data.status}`);
    return true;
  } else {
    logError(`Suspend tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 8: Resume Tenant
 */
async function testResumeTenant() {
  logTest('Test 8: Resume Tenant');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}/resume`, {
    method: 'POST',
  });

  if (response.ok && response.data.success) {
    logSuccess(`Tenant resumed successfully!`);
    logInfo(`Status: ${response.data.data.status}`);
    return true;
  } else {
    logError(`Resume tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 9: Delete Tenant (Soft Delete)
 */
async function testDeleteTenant() {
  logTest('Test 9: Delete Tenant (Soft Delete)');

  if (!createdTenantId) {
    logError('No tenant ID available. Skipping test.');
    return false;
  }

  const response = await apiRequest(`/api/admin/tenants/${createdTenantId}`, {
    method: 'DELETE',
  });

  if (response.ok && response.data.success) {
    logSuccess(`Tenant deleted successfully!`);
    logInfo(`Message: ${response.data.message || 'Tenant suspended (soft delete)'}`);
    return true;
  } else {
    logError(`Delete tenant failed: ${response.data?.message || response.error || 'Unknown error'}`);
    logInfo(`Status: ${response.status}`);
    return false;
  }
}

/**
 * Test 10: Validation Tests
 */
async function testValidations() {
  logTest('Test 10: Validation Tests');

  let passed = 0;
  let failed = 0;

  // Test: Create tenant without name
  logInfo('Testing: Create tenant without name');
  const response1 = await apiRequest('/api/admin/tenants', {
    method: 'POST',
    body: JSON.stringify({ slug: 'test-slug' }),
  });
  if (response1.status === 400) {
    logSuccess('Validation: Missing name rejected');
    passed++;
  } else {
    logError('Validation: Missing name should be rejected');
    failed++;
  }

  // Test: Create tenant with invalid slug
  logInfo('Testing: Create tenant with invalid slug');
  const response2 = await apiRequest('/api/admin/tenants', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test', slug: 'INVALID_SLUG!' }),
  });
  if (response2.status === 400) {
    logSuccess('Validation: Invalid slug rejected');
    passed++;
  } else {
    logError('Validation: Invalid slug should be rejected');
    failed++;
  }

  // Test: Create tenant with duplicate slug
  logInfo('Testing: Create tenant with duplicate slug');
  const response3 = await apiRequest('/api/admin/tenants', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test', slug: testTenantSlug }),
  });
  if (response3.status === 409) {
    logSuccess('Validation: Duplicate slug rejected');
    passed++;
  } else {
    logError('Validation: Duplicate slug should be rejected');
    failed++;
  }

  logInfo(`Validation tests: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

/**
 * Test 11: Access Control Tests
 */
async function testAccessControl() {
  logTest('Test 11: Access Control Tests');

  // Test: Access without token
  logInfo('Testing: Access without authentication token');
  const oldToken = authToken;
  authToken = null;

  const response1 = await apiRequest('/api/admin/tenants');
  if (response1.status === 401 || response1.status === 403) {
    logSuccess('Access control: Unauthenticated request rejected');
  } else {
    logError('Access control: Unauthenticated request should be rejected');
  }

  authToken = oldToken;
  return true;
}

/**
 * Run all tests
 */
async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🧪 TENANT ROUTES TEST SUITE', 'blue');
  log('='.repeat(60) + '\n', 'blue');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const tests = [
    { name: 'Login', fn: testLogin, required: true },
    { name: 'Create Tenant', fn: testCreateTenant, required: true },
    { name: 'Get All Tenants', fn: testGetAllTenants, required: false },
    { name: 'Get Single Tenant', fn: testGetTenant, required: false },
    { name: 'Update Tenant', fn: testUpdateTenant, required: false },
    { name: 'Get Tenant Metrics', fn: testGetTenantMetrics, required: false },
    { name: 'Suspend Tenant', fn: testSuspendTenant, required: false },
    { name: 'Resume Tenant', fn: testResumeTenant, required: false },
    { name: 'Delete Tenant', fn: testDeleteTenant, required: false },
    { name: 'Validations', fn: testValidations, required: false },
    { name: 'Access Control', fn: testAccessControl, required: false },
  ];

  for (const test of tests) {
    try {
      log('\n' + '-'.repeat(60));
      const result = await test.fn();
      if (result) {
        results.passed++;
      } else {
        results.failed++;
        if (test.required) {
          logError(`Required test failed: ${test.name}. Stopping tests.`);
          break;
        }
      }
    } catch (error) {
      logError(`Test ${test.name} threw error: ${error.message}`);
      results.failed++;
      if (test.required) {
        break;
      }
    }
  }

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('📊 TEST SUMMARY', 'blue');
  log('='.repeat(60), 'blue');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, 'red');
  log(`⏭️  Skipped: ${results.skipped}`, 'yellow');
  log('='.repeat(60) + '\n', 'blue');

  if (results.failed === 0) {
    logSuccess('All tests passed! 🎉');
    process.exit(0);
  } else {
    logError(`Some tests failed. Please review the output above.`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
