# 📖 Pulpy Ad-Track API Documentation

This document provides a comprehensive overview of the Pulpy Ad-Track Backend APIs, their usage, and descriptions.

---

## 🔐 1. Authentication
Endpoints for user login, password management, and session control.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/api/v1/auth/login` | `POST` | Public | Authenticates a user and returns a JWT token. |
| `/api/v1/auth/logout` | `POST` | Authenticated | Invalidates the current session. |
| `/api/v1/auth/refresh` | `POST` | Public | Refreshes an expired JWT token. |
| `/api/v1/auth/forgot-password` | `POST` | Public | Triggers a password reset email. |
| `/api/v1/auth/reset-password` | `POST` | Public | Resets password using a valid token. |

---

## 📈 2. Tracking (Public)
Core endpoints for handling redirection, clicks, and impressions.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/click` | `GET/HEAD` | Public | Tracks an offer click and redirects the user to the destination. |
| `/imp` | `GET` | Public | Tracks an ad impression. |
| `/postback` | `GET/POST`| Public | Inbound conversion notification from advertisers. |

---

## 📊 3. Dashboard (Unified Metrics)
High-level analytics and performance summaries for tenants.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/dashboard` | `GET` | Admin | Returns unified stats (clicks, conv, revenue) and top activity. |
| `/dashboard/cards` | `GET` | Admin | Summary cards for quick performance visibility. |
| `/dashboard/performance`| `GET` | Admin | Real-time performance charts data. |
| `/dashboard/info-cards`| `GET` | Admin | System health and tenant-specific info cards. |

---

## 📋 4. Reports
Granular data extraction and detailed performance logs.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/summary` | `GET` | Admin | Aggregated performance summary over a date range. |
| `/detailed` | `GET` | Admin | Row-by-row conversion and click logs. |
| `/conversions` | `GET` | Admin | Full conversion history with status filters. |
| `/publisher-conversions`| `GET` | Admin | Conversion performance broken down by publisher. |
| `/approve-click` | `POST` | Admin | Manually approve a click/conversion. |

---

## 🏢 5. Tenancy & Subscriptions
Super Admin controls for managing platforms and billing.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/tenants` | `GET` | SuperAdmin | List all active and suspended tenants. |
| `/tenants/:id` | `GET` | SuperAdmin | Fetch detailed profile and configuration for a tenant. |
| `/tenants/:id/metrics`| `GET` | SuperAdmin | Operational metrics (usage, limits) for a specific tenant. |
| `/admin/subscriptions/:id`| `GET` | SuperAdmin | Current subscription state and expiry details. |
| `/admin/subscriptions/:id/activate`| `POST`| SuperAdmin | Transition a trial/expired tenant to a paid state. |
| `/subscription/status` | `GET` | Tenant | Allows a tenant to view their own subscription status. |

---

## 🤝 6. Partner Management
Management of Advertisers and Publishers.

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/api/admin/advertisers`| `GET` | Admin | List all advertisers under the current tenant. |
| `/api/admin/advertisers`| `POST` | Admin | Create a new advertiser profile. |
| `/api/admin/publishers` | `GET` | Admin | List all publishers/affiliates. |
| `/api/admin/publishers` | `POST` | Admin | Onboard a new publisher. |

---

## 🛠️ 7. Debug & Diagnostics
System monitoring and health checks (Gated by Admin).

| Endpoint | Method | Access | Description |
| :------- | :----- | :----- | :---------- |
| `/debug/clicks` | `GET` | Admin | Real-time queue depth and Redis stream inspection. |
| `/debug/worker-status`| `GET` | Admin | Status of background click/conversion processors. |
| `/debug/validate/:off/:pub`| `GET`| Admin | Check if a specific O-P assignment is functionally valid. |

---

## 📝 Usage Notes
1. **Tenant Isolation**: Most Admin/Report APIs require `tenant_id` which is automatically resolved from the **subdomain** (e.g., `client.track-myads.com`).
2. **UTC Enforcement**: All timestamps and date range queries must be in **UTC ISO-8601** format for consistency.
3. **Authentication**: Place the JWT token in the `Authorization: Bearer <token>` header for all non-public routes.
