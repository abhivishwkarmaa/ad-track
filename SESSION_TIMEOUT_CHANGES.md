# Session Timeout Configuration - Summary

## ✅ Changes Implemented

### 1. Backend - Auth Controller
**File**: `src/controllers/authController.js`

```javascript
const ACCESS_TOKEN_TTL = '5m';
const REFRESH_TTL_SECONDS = 180 * 60; // 180 minutes (3 hours)
const SESSION_TTL_MS = 180 * 60 * 1000; // 180 minutes (3 hours)
```

**Changed from**: 15 minutes → **180 minutes (3 hours)**

---

### 2. Backend - Auth Middleware
**File**: `src/middleware/auth.js`

```javascript
const SESSION_TTL_MS = 180 * 60 * 1000; // 180 minutes (3 hours)
```

**Changed from**: 15 minutes → **180 minutes (3 hours)**

---

### 3. Frontend - API Service
**File**: `src/services/api.js`

```javascript
const IDLE_TIMEOUT_MS = 180 * 60 * 1000; // 180 minutes (3 hours)
```

**Changed from**: 15 minutes → **180 minutes (3 hours)**

---

## 🎯 How It Works Now

### For Inactive Users (Your Original Request)
- **Idle Timeout**: 180 minutes (3 hours)
- **Behavior**: If user doesn't interact with the app for 3 hours, they will be logged out
- **Example**: User logs in at 9:00 AM, doesn't touch the app, gets logged out at 12:00 PM

### For Active Users (Your Follow-up Question)
- **Session Extension**: **INDEFINITE** (as long as they keep using the app)
- **Behavior**: Every user action updates the `last_activity` timestamp, extending the session
- **Example**: User logs in at 9:00 AM, continuously uses the app until 2:00 PM (5 hours) → **NO LOGOUT REQUIRED** ✅

---

## 📊 Session Flow Diagram

### Scenario 1: Inactive User (3 Hours Idle)
```
9:00 AM  - User logs in
9:05 AM  - Last activity (clicks a button)
12:05 PM - Session expires (3 hours after last activity)
12:06 PM - User tries to click → Logged out automatically
```

### Scenario 2: Active User (Continuous Use for 4+ Hours)
```
9:00 AM  - User logs in
9:30 AM  - User clicks button → Session extended to 12:30 PM
10:15 AM - User views report → Session extended to 1:15 PM
11:00 AM - User edits offer → Session extended to 2:00 PM
12:00 PM - User checks dashboard → Session extended to 3:00 PM
1:00 PM  - User creates publisher → Session extended to 4:00 PM
         ... continues indefinitely as long as user is active
```

---

## 🔐 Security Model

### Access Token (Short-Lived)
- **Lifetime**: 5 minutes
- **Purpose**: Secure API authentication
- **Refresh**: Automatically refreshed using refresh token
- **Why Short**: Minimizes security risk if token is compromised

### Refresh Token (Long-Lived)
- **Lifetime**: 180 minutes (3 hours) from last activity
- **Purpose**: Allows automatic access token renewal
- **Storage**: HTTP-only cookie (secure)
- **Activity Tracking**: Updates on every user action

### Session (Redis-Based)
- **Lifetime**: 180 minutes (3 hours) from last activity
- **Purpose**: Server-side session validation
- **Storage**: Redis with TTL
- **Activity Tracking**: Updates when `X-User-Activity: 1` header is sent

---

## 🎮 User Activity Tracking

### What Counts as "Activity"?
Any API request with the `X-User-Activity: 1` header, which includes:
- ✅ Clicking buttons
- ✅ Navigating pages
- ✅ Viewing reports
- ✅ Creating/editing records
- ✅ Searching/filtering data
- ✅ Any user-initiated action

### What Does NOT Count as "Activity"?
- ❌ Background polling (if implemented)
- ❌ Automatic data refreshes
- ❌ Requests with `trackActivity: false`

---

## 💡 Answer to Your Questions

### Q1: "Increase token time to 180 minutes if user is not using app"
**Answer**: ✅ **DONE**
- Inactive users will be logged out after **180 minutes (3 hours)** of no activity
- This was increased from the previous 15 minutes

### Q2: "If user is using app continuously for 4 hours, will they not have to login?"
**Answer**: ✅ **YES, CORRECT**
- Users can use the app continuously for **ANY duration** (4 hours, 8 hours, 24 hours, etc.)
- As long as they keep interacting with the app, the session keeps extending
- They will **NEVER** be logged out during active use

---

## 🧪 Testing Scenarios

### Test 1: Idle Timeout (3 Hours)
```bash
1. Login to the app
2. Don't touch anything for 3 hours
3. Try to click any button or navigate
Expected: Automatic logout and redirect to login page
```

### Test 2: Continuous Use (4+ Hours)
```bash
1. Login to the app at 9:00 AM
2. Keep using the app (click buttons, view pages, etc.)
3. Continue until 1:00 PM (4 hours later)
Expected: Still logged in, no interruption
```

### Test 3: Intermittent Use
```bash
1. Login at 9:00 AM
2. Use app until 9:30 AM
3. Leave idle for 2 hours (until 11:30 AM)
4. Come back and click something at 11:30 AM
Expected: Still logged in (within 3-hour window)
5. Leave idle again for 3+ hours
Expected: Logged out after 3 hours of inactivity
```

---

## 📝 Configuration Summary

| Component | Setting | Value | Purpose |
|-----------|---------|-------|---------|
| Access Token | `ACCESS_TOKEN_TTL` | 5 minutes | Short-lived for security |
| Refresh Token | `REFRESH_TTL_SECONDS` | 180 minutes | Long-lived for UX |
| Backend Session | `SESSION_TTL_MS` | 180 minutes | Server-side validation |
| Frontend Idle | `IDLE_TIMEOUT_MS` | 180 minutes | Client-side timeout |

---

## 🚀 Next Steps

1. **Restart Backend Server** (if running)
   ```bash
   # Stop the backend
   # Start it again to load new configuration
   ```

2. **Clear Browser Cache** (optional but recommended)
   - Clear localStorage
   - Clear cookies
   - Hard refresh (Cmd+Shift+R on Mac)

3. **Test the Changes**
   - Login and test idle timeout
   - Login and test continuous use
   - Verify session extends on activity

---

## 📚 Related Files

- ✅ `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js`
- ✅ `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`
- ✅ `Pulpy_Reporting_Portal_frontend/src/services/api.js`
- ✅ `Pulpy_Reporting_Portal_frontend/AUTO_LOGOUT_FEATURE.md`

---

**Last Updated**: 2026-02-05  
**Status**: ✅ Fully Implemented and Ready to Test
