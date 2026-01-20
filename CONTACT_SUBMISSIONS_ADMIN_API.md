# Contact Submissions Admin API - Implementation Summary

## Overview
Added comprehensive admin-only APIs for viewing and managing contact form submissions. These endpoints are **strictly restricted** to:
1. ✅ **Super Admin users only** (not tenant admins)
2. ✅ **Admin subdomain only** (admin.domain.com)
3. ✅ **Cannot be accessed from tenant subdomains**

## Security Implementation

### Triple-Layer Security
1. **Admin Subdomain Check** - `requireAdminSubdomain` middleware
   - Verifies request is from admin.domain.com
   - Rejects requests from tenant subdomains

2. **Super Admin Authentication** - `authenticateAdmin` middleware
   - Validates JWT token
   - Verifies user is logged in

3. **Super Admin Authorization** - `requireSuperAdmin` middleware
   - Ensures user has `tenant_id = NULL` (super admin)
   - Rejects tenant admins

### Authorization Flow
```
Request → Admin Subdomain Check → JWT Auth → Super Admin Check → Handler
         ❌ Reject if not admin.* subdomain
                               ❌ Reject if invalid token
                                              ❌ Reject if tenant admin
                                                              ✅ Process request
```

## API Endpoints

### Base URL
All endpoints are under `/api/admin/contact-submissions`

**Only accessible via**: `admin.yourdomain.com/api/admin/contact-submissions`

### 1. Get All Contact Submissions
```http
GET /api/admin/contact-submissions
```

**Query Parameters:**
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 50)
- `status` (optional) - Filter by status: `new`, `read`, `replied`, `archived`
- `search` (optional) - Search in name, email, or message

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "message": "I have a question about...",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "referer": "https://example.com",
      "status": "new",
      "created_at": "2026-01-20T10:30:00Z",
      "updated_at": "2026-01-20T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### 2. Get Single Contact Submission
```http
GET /api/admin/contact-submissions/:id
```

**Behavior:**
- Automatically marks submission as `read` if status is `new`
- Returns full submission details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "message": "I have a question about...",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "referer": "https://example.com",
    "status": "read",
    "created_at": "2026-01-20T10:30:00Z",
    "updated_at": "2026-01-20T10:31:00Z"
  }
}
```

### 3. Get Contact Statistics
```http
GET /api/admin/contact-submissions/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "recent": 25,
    "byStatus": {
      "new": 10,
      "read": 50,
      "replied": 70,
      "archived": 20
    }
  }
}
```

### 4. Update Contact Status
```http
PATCH /api/admin/contact-submissions/:id/status
```

**Request Body:**
```json
{
  "status": "replied"
}
```

**Valid Status Values:**
- `new` - Unread submission
- `read` - Viewed by admin
- `replied` - Admin has responded
- `archived` - Closed/archived

**Response:**
```json
{
  "success": true,
  "message": "Contact submission status updated successfully"
}
```

### 5. Delete Contact Submission
```http
DELETE /api/admin/contact-submissions/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Contact submission deleted successfully"
}
```

## Frontend Integration

### API Client Functions
Added to `services/api.js`:

```javascript
import { contactSubmissionsAPI } from './services/api';

// Get all submissions
const response = await contactSubmissionsAPI.getContactSubmissions({
  page: 1,
  limit: 50,
  status: 'new',
  search: 'john'
});

// Get single submission
const submission = await contactSubmissionsAPI.getContactSubmission(1);

// Update status
await contactSubmissionsAPI.updateContactStatus(1, 'replied');

// Delete submission
await contactSubmissionsAPI.deleteContactSubmission(1);

// Get statistics
const stats = await contactSubmissionsAPI.getContactStats();
```

## Database Schema

### Table: `contact_submissions`

```sql
CREATE TABLE `contact_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `referer` varchar(500) DEFAULT NULL,
  `status` enum('new','read','replied','archived') DEFAULT 'new',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_contact_submissions_email` (`email`),
  KEY `idx_contact_submissions_status` (`status`),
  KEY `idx_contact_submissions_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Access Control Matrix

| Endpoint | Super Admin (admin.domain.com) | Tenant Admin (tenant.domain.com) | Public |
|----------|-------------------------------|----------------------------------|--------|
| `GET /contact-submissions` | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| `GET /contact-submissions/:id` | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| `GET /contact-submissions/stats` | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| `PATCH /contact-submissions/:id/status` | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| `DELETE /contact-submissions/:id` | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| `POST /api/contact` (submit) | ✅ Allowed | ✅ Allowed | ✅ Allowed |

## Error Responses

### 403 Forbidden (Not Super Admin)
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Only super admins can view contact submissions"
}
```

### 403 Forbidden (Not Admin Subdomain)
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "This endpoint requires admin subdomain access"
}
```

### 401 Unauthorized (No Token)
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Not Found",
  "message": "Contact submission not found"
}
```

### 400 Bad Request (Invalid Status)
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Invalid status. Must be one of: new, read, replied, archived"
}
```

## Logging

All admin actions are logged with:
- Admin ID who performed the action
- Submission ID affected
- Action performed
- Timestamp

**Example log:**
```
✅ Contact submission status updated by admin
{
  adminId: 1,
  submissionId: 25,
  newStatus: 'replied'
}
```

## Usage Example Workflow

### 1. Admin Logs In
```javascript
// Login via admin.domain.com
const response = await authAPI.login('admin@domain.com', 'password');
// Receives JWT token with isSuperAdmin: true
```

### 2. View Contact Submissions Dashboard
```javascript
// Get statistics
const stats = await contactSubmissionsAPI.getContactStats();
// Shows: 10 new, 50 read, 70 replied, 20 archived

// Get new submissions
const newSubmissions = await contactSubmissionsAPI.getContactSubmissions({
  status: 'new',
  page: 1,
  limit: 20
});
```

### 3. View and Respond to Submission
```javascript
// View submission (auto-marks as read)
const submission = await contactSubmissionsAPI.getContactSubmission(123);

// After responding via email, update status
await contactSubmissionsAPI.updateContactStatus(123, 'replied');
```

### 4. Archive Old Submissions
```javascript
// Search and archive
const oldSubmissions = await contactSubmissionsAPI.getContactSubmissions({
  search: '2025',
  limit: 100
});

// Archive each
for (const sub of oldSubmissions.data) {
  await contactSubmissionsAPI.updateContactStatus(sub.id, 'archived');
}
```

## Testing

### Test Super Admin Access (Should Work)
```bash
curl -X GET "https://admin.domain.com/api/admin/contact-submissions" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected:** ✅ 200 OK with submissions list

### Test Tenant Admin Access (Should Fail)
```bash
curl -X GET "https://admin.domain.com/api/admin/contact-submissions" \
  -H "Authorization: Bearer TENANT_ADMIN_TOKEN"
```

**Expected:** ❌ 403 Forbidden

### Test From Tenant Subdomain (Should Fail)
```bash
curl -X GET "https://tenant1.domain.com/api/admin/contact-submissions" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected:** ❌ 403 Forbidden (Not admin subdomain)

### Test Without Authentication (Should Fail)
```bash
curl -X GET "https://admin.domain.com/api/admin/contact-submissions"
```

**Expected:** ❌ 401 Unauthorized

## Files Modified

### Backend
1. **`src/controllers/contactController.js`** - Added 5 new admin methods
   - `getAllContactSubmissions()` - List with pagination
   - `getContactSubmission()` - View single (auto-marks read)
   - `updateContactStatus()` - Change status
   - `deleteContactSubmission()` - Delete
   - `getContactStats()` - Get statistics

2. **`src/routes/admin.js`** - Added 5 new routes with security
   - All routes use `requireAdminSubdomain` + `requireSuperAdmin`

### Frontend
3. **`src/services/api.js`** - Added `contactSubmissionsAPI` object
   - 5 API client functions matching backend endpoints

## Next Steps for Frontend

To complete the implementation, you should create:

1. **Contact Submissions Page** (`pages/ContactSubmissions/ManageContactSubmissions.jsx`)
   - List view with status badges
   - Pagination controls
   - Status filter dropdown
   - Search functionality
   - Stats cards at top

2. **Contact Detail Modal/Page** (`pages/ContactSubmissions/ContactDetail.jsx`)
   - Full submission details
   - Status change buttons
   - Delete confirmation
   - Email copy button

3. **Add to Sidebar** (for admin subdomain only)
   ```jsx
   {isAdminDomain && (
     <NavLink to="/contact-submissions">
       <ContactIcon /> Contact Submissions
     </NavLink>
   )}
   ```

## Security Notes

⚠️ **IMPORTANT**: These endpoints are designed with defense-in-depth security:

1. **Admin subdomain enforcement** prevents tenant admins from accessing
2. **Super admin check** in controller provides additional validation
3. **JWT authentication** ensures user is logged in
4. **All checks happen before data access**

This ensures contact submissions are **only visible to platform super admins** and **never accessible from tenant subdomains**, maintaining strict data isolation.

---

**Implementation Date**: January 2026  
**Status**: ✅ Complete (Backend + Frontend API)  
**Next**: Create admin frontend UI for viewing submissions
