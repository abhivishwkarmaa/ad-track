# Subscription System - Visual Flow Diagrams

## State Transition Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT SUBSCRIPTION STATES                    │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   TRIAL      │
                    │ (10 days)    │
                    │ Full Access  │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         │ Trial Expires   │ Subscription    │ Admin
         │ (10 days)       │ Activated       │ Suspends
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐     ┌────────────┐
    │EXPIRED  │◄─────│ ACTIVE   │────►│ SUSPENDED  │
    │Read-Only│      │Full Access│     │  Blocked   │
    └────┬────┘      └────┬─────┘     └─────┬──────┘
         │                │                  │
         │ Subscription   │ Subscription     │ Admin
         │ Activated      │ Expires          │ Unsuspends
         │                │                  │
         └────────────────┼──────────────────┘
                          │
                          ▼
                    (Restore to
                   appropriate state)
```

---

## First Login Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      FIRST LOGIN FLOW                            │
└─────────────────────────────────────────────────────────────────┘

User Login Request
      │
      ▼
┌─────────────────┐
│ Resolve Tenant  │ ◄── From subdomain (e.g., acme.track-myads.com)
│ from Subdomain  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Authenticate    │
│ User            │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check Subscription Status   │
│ - trial_start_at = NULL?    │
│ - subscription_start_at = NULL? │
└────────┬────────────────────┘
         │
         ├─── YES ──► ┌──────────────────────┐
         │            │ START TRIAL          │
         │            │ - trial_start_at = NOW│
         │            │ - trial_end_at = +10d│
         │            │ - status = TRIAL     │
         │            └──────────┬───────────┘
         │                       │
         └─── NO ───────────────►│
                                 │
                                 ▼
                        ┌────────────────┐
                        │ Update State   │
                        │ (if needed)    │
                        └────────┬───────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │ Check State    │
                        └────────┬───────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
    SUSPENDED              TRIAL/ACTIVE              EXPIRED
         │                       │                       │
         ▼                       ▼                       ▼
    Block Login            Issue Token            Issue Token
    (403 Error)           (Full Access)         (Read-Only)
```

---

## Access Control Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCESS CONTROL FLOW                           │
└─────────────────────────────────────────────────────────────────┘

API Request
      │
      ▼
┌─────────────────┐
│ Authenticate    │
│ User            │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Attach Subscription Status  │
│ (middleware)                │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check Access Level          │
│ Based on Route Middleware   │
└────────┬────────────────────┘
         │
         ├─── requireActiveSubscription ───┐
         │                                  │
         ├─── allowReadOnlyAccess ─────────┤
         │                                  │
         └─── attachSubscriptionStatus ────┤
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │ Check State    │
                                   └────────┬───────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────┐
         │                                  │                          │
         ▼                                  ▼                          ▼
    SUSPENDED                          EXPIRED                   TRIAL/ACTIVE
         │                                  │                          │
         ▼                                  ▼                          ▼
    Block (403)                    Check Middleware             Allow Access
    "Account Suspended"                    │                          │
                                           │                          │
                              ┌────────────┼────────────┐            │
                              │                         │            │
                              ▼                         ▼            │
                    requireActiveSubscription   allowReadOnlyAccess  │
                              │                         │            │
                              ▼                         ▼            │
                         Block (403)              Allow Read         │
                      "Subscription Expired"      (Read-Only)        │
                                                                     │
                                                                     ▼
                                                              Allow Full Access
```

---

## Admin Subscription Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              ADMIN SUBSCRIPTION MANAGEMENT                       │
└─────────────────────────────────────────────────────────────────┘

Admin Request
      │
      ▼
┌─────────────────┐
│ Authenticate    │
│ Super Admin     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Select Action               │
└────────┬────────────────────┘
         │
         ├─── Activate Subscription ──► ┌──────────────────────┐
         │                               │ Set:                 │
         │                               │ - subscription_start │
         │                               │ - subscription_end   │
         │                               │ - status = ACTIVE    │
         │                               └──────────┬───────────┘
         │                                          │
         ├─── Extend Subscription ─────► ┌──────────────────────┐
         │                               │ Add N days to        │
         │                               │ subscription_end     │
         │                               └──────────┬───────────┘
         │                                          │
         ├─── Suspend Tenant ──────────► ┌──────────────────────┐
         │                               │ Set:                 │
         │                               │ - status = SUSPENDED │
         │                               └──────────┬───────────┘
         │                                          │
         ├─── Unsuspend Tenant ─────────► ┌──────────────────────┐
         │                               │ Restore to:          │
         │                               │ - ACTIVE/TRIAL/EXPIRED│
         │                               └──────────┬───────────┘
         │                                          │
         └─── Reset Trial ─────────────► ┌──────────────────────┐
                                         │ Set:                 │
                                         │ - trial_start = NOW  │
                                         │ - trial_end = +10d   │
                                         │ - status = TRIAL     │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │ Log to               │
                                         │ subscription_history │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │ Return Updated       │
                                         │ Subscription Status  │
                                         └──────────────────────┘
```

---

## Countdown & Warning System

```
┌─────────────────────────────────────────────────────────────────┐
│                  COUNTDOWN & WARNING SYSTEM                      │
└─────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │ Trial/Sub    │
                        │ Active       │
                        └──────┬───────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ Calculate        │
                    │ days_left        │
                    │ = ceil((end-now)/│
                    │       86400000)  │
                    └──────┬───────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    days_left > 3     days_left ≤ 3     days_left ≤ 0
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐     ┌────────────┐
    │ Normal  │      │ WARNING  │     │  EXPIRED   │
    │ Display │      │ Banner   │     │  Banner    │
    └─────────┘      └──────────┘     └────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
    "Trial: 10      "Trial ending     "Your access
     days left"      in 2 days —       has expired.
                     upgrade to        Contact
                     avoid             billing@..."
                     interruption"

    Badge Color:    Badge Color:      Alert Type:
    - Info/Blue     - Warning/Yellow  - Danger/Red
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Frontend   │
│   (React)    │
└──────┬───────┘
       │ HTTP Request
       │ (with subdomain)
       ▼
┌──────────────────────────────────────────────────────────────┐
│                        Backend API                            │
│                                                               │
│  ┌────────────────┐                                          │
│  │ Tenant         │ ◄── Extract from subdomain              │
│  │ Middleware     │                                          │
│  └────────┬───────┘                                          │
│           │                                                   │
│           ▼                                                   │
│  ┌────────────────┐                                          │
│  │ Auth           │                                          │
│  │ Middleware     │                                          │
│  └────────┬───────┘                                          │
│           │                                                   │
│           ▼                                                   │
│  ┌────────────────────┐                                      │
│  │ Subscription       │ ◄── Check tenant state              │
│  │ Middleware         │                                      │
│  └────────┬───────────┘                                      │
│           │                                                   │
│           ▼                                                   │
│  ┌────────────────────┐                                      │
│  │ Route Handler      │                                      │
│  └────────┬───────────┘                                      │
│           │                                                   │
│           ▼                                                   │
│  ┌────────────────────┐                                      │
│  │ Subscription       │ ◄── Business logic                  │
│  │ Service            │                                      │
│  └────────┬───────────┘                                      │
│           │                                                   │
│           ▼                                                   │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────┐
│                        Database                               │
│                                                               │
│  ┌────────────────┐          ┌──────────────────────┐       │
│  │   tenants      │          │ subscription_history │       │
│  │                │          │                      │       │
│  │ - status       │          │ - action             │       │
│  │ - trial_*      │          │ - previous_state     │       │
│  │ - subscription_*│         │ - new_state          │       │
│  └────────────────┘          │ - admin_id           │       │
│                              │ - notes              │       │
│                              └──────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## Cron Job State Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  CRON JOB STATE UPDATE                           │
└─────────────────────────────────────────────────────────────────┘

        Every Hour (0 * * * *)
                │
                ▼
    ┌───────────────────────┐
    │ CALL                  │
    │ update_all_tenant_    │
    │ states()              │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ For Each Tenant       │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ CALL                  │
    │ calculate_tenant_     │
    │ state(tenant_id)      │
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────────┐
    │ Get Current State         │
    │ - trial_end_at            │
    │ - subscription_end_at     │
    │ - status                  │
    └───────────┬───────────────┘
                │
                ▼
    ┌───────────────────────────┐
    │ Calculate New State       │
    │ Based on:                 │
    │ - Current time (UTC)      │
    │ - Expiry dates            │
    │ - Priority rules          │
    └───────────┬───────────────┘
                │
                ▼
    ┌───────────────────────────┐
    │ State Changed?            │
    └───────────┬───────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
       YES             NO
        │               │
        ▼               ▼
    ┌────────┐     ┌────────┐
    │ Update │     │ Skip   │
    │ Status │     └────────┘
    └───┬────┘
        │
        ▼
    ┌────────────────┐
    │ Log to         │
    │ subscription_  │
    │ history        │
    └────────────────┘
```

---

## Timeline Example: 10-Day Trial

```
┌─────────────────────────────────────────────────────────────────┐
│                    10-DAY TRIAL TIMELINE                         │
└─────────────────────────────────────────────────────────────────┘

Day 0: First Login
│
├─► Trial Starts
│   - trial_start_at = 2026-02-04 07:00:00 UTC
│   - trial_end_at   = 2026-02-14 07:00:00 UTC
│   - status = TRIAL
│   - days_left = 10
│
│   UI: "Trial: 10 days left" (Blue badge)
│
│
Day 1-7: Normal Usage
│
│   UI: "Trial: X days left" (Blue badge)
│   Access: Full
│
│
Day 8: Warning Threshold
│
├─► Warning Starts (≤ 3 days)
│   - days_left = 3
│   - is_warning = true
│
│   UI: "Trial ending in 3 days — upgrade to avoid interruption"
│       (Yellow warning banner)
│
│
Day 9:
│   - days_left = 2
│   UI: "Trial ending in 2 days — upgrade to avoid interruption"
│
│
Day 10:
│   - days_left = 1
│   UI: "Trial ending in 1 day — upgrade to avoid interruption"
│
│
Day 11: Trial Expires
│
├─► State Changes to EXPIRED
│   - status = EXPIRED
│   - access_level = read_only
│
│   UI: "Your access has expired. Please contact billing@..."
│       (Red danger banner)
│   
│   Access: Read-only (can view, cannot create/edit/delete)
│
│
Future: Subscription Activated
│
└─► Admin activates subscription
    - subscription_start_at = NOW
    - subscription_end_at = +30 days
    - status = ACTIVE
    
    UI: "Subscription expires in 30 days" (Blue badge)
    Access: Full
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING FLOW                           │
└─────────────────────────────────────────────────────────────────┘

API Request
      │
      ▼
┌─────────────────┐
│ Try Block       │
└────────┬────────┘
         │
         ├─── Success ──────────────────────► Return 200/201
         │
         └─── Error ──► ┌──────────────────┐
                        │ Catch Block      │
                        └────────┬─────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
    Validation Error      Business Logic Error    System Error
         │                       │                       │
         ▼                       ▼                       ▼
    Return 400            Return 403/409          Return 500
    {                     {                       {
      success: false,       success: false,         success: false,
      error: "Validation    error: "Subscription    error: "Internal
              Error",               Expired",               Server Error",
      message: "..."        message: "..."          message: "..."
    }                     }                       }
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │ Log Error      │
                        │ (Server-side)  │
                        └────────────────┘
```
