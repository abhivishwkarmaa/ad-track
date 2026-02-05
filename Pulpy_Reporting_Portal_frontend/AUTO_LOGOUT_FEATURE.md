# ✅ AUTO-LOGOUT ON TOKEN EXPIRY

## Feature Summary

When a user's JWT token is invalid or expired, the system now **automatically logs them out** and redirects to the login page **without showing any error messages**. This provides a seamless user experience.

---

## How It Works

### Before (❌ Bad UX)
```
User makes API request
  ↓
Token expired
  ↓
❌ Error toast: "Token expired" or "Invalid token"
  ↓
User confused, has to manually logout/refresh
```

### After (✅ Good UX)
```
User makes API request
  ↓
Token expired
  ↓
✅ Silent logout (no error message)
  ↓
Automatic redirect to /login
  ↓
User can login again seamlessly
```

---

## Implementation Details

### File Modified
`src/services/api.js` - The central API request handler

### Code Changes

```javascript
// ✅ AUTO-LOGOUT: Check for 401 Unauthorized or token-related errors
if (response.status === 401) {
    const errorMessage = data?.message || data?.error || '';
    const isTokenError = errorMessage.toLowerCase().includes('token') || 
                        errorMessage.toLowerCase().includes('unauthorized') ||
                        errorMessage.toLowerCase().includes('expired') ||
                        errorMessage.toLowerCase().includes('invalid');
    
    if (isTokenError) {
        // ✅ Silent logout - no error messages shown to user
        localStorage.removeItem('track-myads_user');
        
        // Redirect to login page
        window.location.href = '/login';
        
        // Throw error to stop further execution
        throw new Error('SESSION_EXPIRED');
    }
}
```

---

## What Triggers Auto-Logout

The system automatically logs out when:

1. **HTTP 401 Unauthorized** response is received
2. **AND** the error message contains any of these keywords:
   - `"token"`
   - `"unauthorized"`
   - `"expired"`
   - `"invalid"`

### Examples of Backend Errors That Trigger Logout

✅ **Will trigger auto-logout:**
- `"Invalid token"`
- `"Token expired"`
- `"JWT token is invalid"`
- `"Unauthorized access"`
- `"Token verification failed"`
- `"Expired token"`

❌ **Will NOT trigger auto-logout:**
- `"User not found"` (401 but not token-related)
- `"Insufficient permissions"` (403 Forbidden)
- `"Resource not found"` (404)
- `"Validation error"` (400)

---

## User Experience Flow

### Scenario 1: Token Expires While Browsing

```
1. User is on Dashboard
2. Token expires (JWT TTL reached)
3. User clicks "View Offers"
4. API request made with expired token
5. Backend returns 401 "Token expired"
6. ✅ Frontend silently logs out
7. ✅ Redirects to /login
8. User sees login page (no error message)
9. User logs in again
10. Redirected back to Dashboard
```

### Scenario 2: Invalid Token (Tampered/Corrupted)

```
1. User has corrupted token in localStorage
2. User tries to access any page
3. API request made with invalid token
4. Backend returns 401 "Invalid token"
5. ✅ Frontend silently logs out
6. ✅ Redirects to /login
7. User sees login page (no error message)
```

### Scenario 3: Token Revoked by Admin

```
1. Admin revokes user's access
2. User tries to make API request
3. Backend returns 401 "Unauthorized"
4. ✅ Frontend silently logs out
5. ✅ Redirects to /login
6. User sees login page
```

---

## Technical Details

### localStorage Cleanup

When auto-logout is triggered:
```javascript
localStorage.removeItem('track-myads_user');
```

This removes the stored user object containing:
- JWT token
- User ID
- User email
- User role
- Any other user data

### Redirect Behavior

```javascript
window.location.href = '/login';
```

- **Hard redirect** (not React Router navigation)
- **Clears all React state** (fresh start)
- **No error messages** shown to user
- **No toast notifications**

### Error Handling

```javascript
// ✅ Don't show error messages for session expiry
if (error.message === 'SESSION_EXPIRED') {
    throw error;
}
```

- `SESSION_EXPIRED` error is thrown but not displayed
- Prevents error toasts from appearing
- Stops further API request processing

---

## Testing Scenarios

### Test 1: Expired Token
```bash
# 1. Login to the app
# 2. Wait for JWT to expire (check JWT_EXPIRY in backend .env)
# 3. Try to navigate to any page or make any action
# Expected: Silent redirect to /login
```

### Test 2: Invalid Token
```bash
# 1. Login to the app
# 2. Open browser DevTools → Application → Local Storage
# 3. Find 'track-myads_user' key
# 4. Modify the token value to something invalid
# 5. Refresh the page or make any action
# Expected: Silent redirect to /login
```

### Test 3: Deleted Token
```bash
# 1. Login to the app
# 2. Open browser DevTools → Application → Local Storage
# 3. Delete 'track-myads_user' key
# 4. Try to navigate to any protected page
# Expected: Redirect to /login (no API call made)
```

### Test 4: Normal Logout
```bash
# 1. Login to the app
# 2. Click "Logout" button
# Expected: Normal logout flow (not affected by this feature)
```

---

## Backend Requirements

For this feature to work correctly, the backend must:

1. **Return 401 status code** for expired/invalid tokens
2. **Include descriptive error message** containing keywords like:
   - "token"
   - "expired"
   - "invalid"
   - "unauthorized"

### Example Backend Response

```json
{
  "success": false,
  "message": "Token expired",
  "error": "JWT_EXPIRED"
}
```

or

```json
{
  "success": false,
  "message": "Invalid token",
  "error": "JWT_INVALID"
}
```

---

## JWT Token Expiry Configuration

**Backend Files**: 
- `src/controllers/authController.js`
- `src/middleware/auth.js`

```javascript
// Access token expires every 5 minutes (short-lived for security)
const ACCESS_TOKEN_TTL = '5m';

// Refresh token and session valid for 180 minutes (3 hours)
const REFRESH_TTL_SECONDS = 180 * 60;
const SESSION_TTL_MS = 180 * 60 * 1000;
```

**Frontend File**: `src/services/api.js`

```javascript
// Idle timeout matches backend session timeout
const IDLE_TIMEOUT_MS = 180 * 60 * 1000; // 180 minutes (3 hours)
```

**How It Works**:
- **Access Token**: Expires every 5 minutes for security
- **Refresh Token**: Valid for 180 minutes (3 hours) from last activity
- **Session**: Valid for 180 minutes (3 hours) from last activity
- **Activity Tracking**: Each user action updates `last_activity` timestamp
- **Continuous Use**: If user is actively using the app, session extends indefinitely
- **Idle Timeout**: After 180 minutes of inactivity, user must login again

---

## Security Benefits

✅ **Prevents Stale Sessions** - Expired tokens are immediately invalidated  
✅ **Automatic Cleanup** - No manual logout needed  
✅ **Better UX** - No confusing error messages  
✅ **Secure** - Removes token from localStorage immediately  
✅ **Consistent** - Works across all API endpoints  

---

## Edge Cases Handled

### 1. Multiple Tabs Open
```
Tab 1: Token expires, auto-logout
Tab 2: Next API call will also trigger auto-logout
Result: All tabs redirect to login
```

### 2. Concurrent API Requests
```
Request 1: Token expired → triggers logout
Request 2: Token expired → also triggers logout
Result: Only one redirect happens (browser behavior)
```

### 3. Network Errors
```
Network timeout or connection error
Result: Normal error handling (not auto-logout)
Only 401 + token error triggers logout
```

### 4. Other 401 Errors
```
401 "User not found"
Result: Normal error handling (not auto-logout)
Only token-related 401s trigger logout
```

---

## Comparison with Other Approaches

| Approach | UX | Security | Implementation |
|----------|-----|----------|----------------|
| **Show error toast** | ❌ Confusing | ✅ Secure | ✅ Simple |
| **Auto-logout (this)** | ✅ Seamless | ✅ Secure | ✅ Simple |
| **Refresh token** | ✅ Seamless | ✅ Secure | ❌ Complex |
| **Keep user logged in** | ✅ Seamless | ❌ Insecure | ✅ Simple |

---

## Future Enhancements (Optional)

### 1. Remember Last Page
```javascript
// Before redirect
sessionStorage.setItem('returnUrl', window.location.pathname);

// After login
const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';
navigate(returnUrl);
```

### 2. Show Subtle Notification
```javascript
// Optional: Show a subtle message (not error)
sessionStorage.setItem('loginMessage', 'Your session has expired. Please login again.');

// On login page
const message = sessionStorage.getItem('loginMessage');
if (message) {
  // Show as info, not error
  toast.info(message);
  sessionStorage.removeItem('loginMessage');
}
```

### 3. Token Refresh (Advanced)
```javascript
// Implement refresh token flow
// Automatically refresh token before expiry
// Requires backend support for refresh tokens
```

---

## Files Modified

| File | Changes | Impact |
|------|---------|--------|
| `src/services/api.js` | Added auto-logout logic | ✅ All API calls protected |

---

## Testing Checklist

- [ ] Login with valid credentials
- [ ] Wait for token to expire
- [ ] Try to navigate to any page
- [ ] Verify silent redirect to /login
- [ ] Verify no error messages shown
- [ ] Verify localStorage cleared
- [ ] Login again successfully
- [ ] Verify normal logout still works
- [ ] Test with invalid token (manually corrupted)
- [ ] Test with deleted token
- [ ] Test with multiple tabs open

---

## Benefits Summary

✅ **Better User Experience** - No confusing error messages  
✅ **Automatic** - No manual intervention needed  
✅ **Secure** - Immediately clears expired tokens  
✅ **Consistent** - Works across all pages and API calls  
✅ **Simple** - No complex refresh token logic  
✅ **Reliable** - Handles all token expiry scenarios  

---

**Updated**: 2026-01-27  
**Status**: ✅ Implemented and Ready to Test
