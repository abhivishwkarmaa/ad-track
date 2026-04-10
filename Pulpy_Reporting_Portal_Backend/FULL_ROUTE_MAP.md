# 🛤️ Pulpy Ad-Track: Full API Route Map

This document contains **EVERY** route registered in the Pulpy Ad-Track Backend, organized by their functional modules and full URI paths.

---

## 🏥 Health & System
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server health check and timestamp. |

---

## 🔐 Authentication (`/api/auth`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Login and receive JWT. |
| `POST` | `/api/auth/register` | Register new platform account. |
| `POST` | `/api/auth/refresh` | Refresh expired access token. |
| `POST` | `/api/auth/logout` | Invalidate current session. |
| `GET` | `/api/auth/profile` | (Auth) Get current user profile. |
| `PATCH` | `/api/auth/profile` | (Auth) Update profile specific fields. |
| `POST` | `/api/auth/forgot-password/request-otp` | Trigger password reset OTP. |
| `POST` | `/api/auth/forgot-password/verify-otp` | Verify OTP for reset. |
| `POST` | `/api/auth/forgot-password/reset` | Finalize password reset. |
| `POST` | `/api/auth/change-password/request-otp` | (Auth) Request OTP to change password. |
| `POST` | `/api/auth/change-password/verify-otp` | (Auth) Verify OTP for change. |
| `POST` | `/api/auth/change-password/reset` | (Auth) Reset password after verification. |

---

## 👤 Admin & Publishers (`/api/admin`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/publishers` | Create a new publisher. |
| `PATCH` | `/api/admin/publishers/:id` | Update publisher details. |
| `DELETE` | `/api/admin/publishers/:id` | (Auth) Remove a publisher. |
| `GET` | `/api/admin/publishers` | List all publishers for tenant. |
| `GET` | `/api/admin/publishers/:id` | Get single publisher details. |
| `POST` | `/api/admin/assignments` | Create Offer-Publisher assignment. |
| `PATCH` | `/api/admin/assignments/:id` | Update assignment settings. |
| `GET` | `/api/admin/assignments` | List all assignments. |
| `GET` | `/api/admin/assignments/:id/tracking-url` | Generate tracking URL for assignment. |
| `GET` | `/api/admin/assignments/:id` | Get assignment details. |
| `DELETE` | `/api/admin/assignments/:id` | Remove assignment. |
| `POST` | `/api/admin/test-conversion` | Manually fire a test conversion. |
| `POST` | `/api/admin/test-affiliate-postback` | Test outgoing postback loop. |
| `POST` | `/api/admin/test-tracking-loop` | Test end-to-end tracking redirect. |
| `GET` | `/api/admin/affiliate-postback-logs` | View outbound postback history. |

---

## 🏢 Tenant Management (`/api/admin`)
*SuperAdmin Access Required*
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/tenants` | Create new tenant (Platform). |
| `GET` | `/api/admin/tenants` | List all tenants. |
| `GET` | `/api/admin/tenants/:id` | Get tenant details. |
| `PATCH` | `/api/admin/tenants/:id` | Update tenant configuration. |
| `POST` | `/api/admin/tenants/:id/suspend` | Block all access for tenant. |
| `POST` | `/api/admin/tenants/:id/resume` | Restore tenant access. |
| `GET` | `/api/admin/tenants/:id/metrics` | View tenant operational stats. |
| `DELETE` | `/api/admin/tenants/:id` | Delete tenant. |

---

## 📈 Offers & Advertisers
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/advertisers` | Create new advertiser. |
| `PATCH` | `/api/admin/advertisers/:id` | Update advertiser profile. |
| `GET` | `/api/admin/advertisers` | List all advertisers. |
| `GET` | `/api/admin/advertisers/:id` | Get advertiser details. |
| `DELETE` | `/api/admin/advertisers/:id` | Delete advertiser. |
| `POST` | `/api/admin/offers` | Create new offer. |
| `GET` | `/api/admin/offers/:id/edit` | Get offer data for editing. |
| `PATCH` | `/api/admin/offers/:id` | Update offer configuration. |
| `PATCH` | `/api/admin/offers/:id/status` | Change live/paused status. |
| `DELETE` | `/api/admin/offers/:id` | Delete offer. |
| `PATCH` | `/api/admin/offers/assignments/:assignmentId` | Update specific assignment inline. |
| `GET` | `/api/admin/offers` | List all offers. |
| `GET` | `/api/admin/offers/search` | Search offers with filters. |
| `GET` | `/api/admin/offers/:id` | Get offer details. |
| `GET` | `/api/admin/offers/:id/stats` | Performance metrics for offer. |
| `GET` | `/api/admin/offers/:id/daily-stats` | 30-day daily breakdown for offer. |
| `GET` | `/api/admin/offers/:id/assignments` | List all publishers assigned to offer. |
| `GET` | `/api/admin/offers/:id/recent-clicks` | Last 50 clicks for offer. |
| `GET` | `/api/admin/offers/:id/recent-conversions` | Last 50 conversions for offer. |
| `GET` | `/api/admin/offers/:id/publisher-stats` | Performance breakdown by publisher for this offer. |

---

## 📊 Analytics & Reporting (`/api/admin/reports`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/reports/dashboard` | Unified dashboard summary. |
| `GET` | `/api/admin/reports/dashboard/cards` | Quick stat cards. |
| `GET` | `/api/admin/reports/dashboard/live-offers` | Active offers list. |
| `GET` | `/api/admin/reports/dashboard/recent-activity` | Global recent clicks/conversions. |
| `GET` | `/api/admin/reports/dashboard/top-offers` | Top 10 performing offers. |
| `GET` | `/api/admin/reports/dashboard/performance` | Performance chart data. |
| `GET` | `/api/admin/reports/dashboard/top-affiliates` | Best performing publishers. |
| `GET` | `/api/admin/reports/dashboard/info-cards` | System informational metrics. |
| `GET` | `/api/admin/reports/dashboard/top-countries` | Click breakdown by country. |
| `GET` | `/api/admin/reports/dashboard/offer-statistics` | Offer-level comparative stats. |
| `GET` | `/api/admin/reports/dashboard/publisher-statistics` | Publisher-level comparative stats. |
| `GET` | `/api/admin/reports/dashboard/performance-comparison` | WoW/MoM growth comparison. |
| `GET` | `/api/admin/reports/dashboard/performance-summary` | High-level growth summary. |
| `GET` | `/api/admin/reports/summary` | General performance summary. |
| `GET` | `/api/admin/reports/detailed` | Detailed drill-down report. |
| `GET` | `/api/admin/reports/publisher-conversions` | Publisher-specific conversion stats. |
| `GET` | `/api/admin/reports/conversions` | Comprehensive conversion logs. |
| `POST` | `/api/admin/reports/approve-click` | Force approve a pending click. |

---

## 💳 Subscriptions & Billing (`/api`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/subscriptions/:tenantId` | (SuperAdmin) Get subscription status. |
| `POST` | `/api/admin/subscriptions/:tenantId/activate` | (SuperAdmin) Active tenant subscription. |
| `POST` | `/api/admin/subscriptions/:tenantId/extend` | (SuperAdmin) Extend subscription days. |
| `POST` | `/api/admin/subscriptions/:tenantId/set-end-date` | (SuperAdmin) Set specific expiry. |
| `POST` | `/api/admin/subscriptions/:tenantId/suspend` | (SuperAdmin) Suspend subscription. |
| `POST` | `/api/admin/subscriptions/:tenantId/unsuspend` | (SuperAdmin) Unsuspend subscription. |
| `POST` | `/api/admin/subscriptions/:tenantId/reset-trial` | (SuperAdmin) Start trial period over. |
| `GET` | `/api/admin/subscriptions/:tenantId/history` | (SuperAdmin) Lifecycle audit log. |
| `GET` | `/api/subscription/status` | (Tenant) View own platform status. |

---

## 🧪 Testing & Debug (`/api/test-postback`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/test-postback/start` | Start isolated postback test session. |
| `GET` | `/api/test-postback/status` | Poll status of active test session. |
| `GET` | `/debug/clicks` | (Admin) Inspect click stream depth. |
| `GET` | `/debug/validate/:off/:pub` | (Admin) Validate specific tracking pair. |
| `GET` | `/debug/worker-status` | (Admin) Worker health and DB catch-up status. |

---

## 📬 Public Inbound
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET/HEAD`| `/click` | Tracking redirect (Primary Click Entry). |
| `GET` | `/imp` | Ad impression tracking. |
| `GET/POST` | `/postback` | Global advertiser conversion callback. |
| `POST` | `/api/contact/send-otp` | Contact form verification. |
| `POST` | `/api/contact/verify-otp` | Finalize contact submission. |
| `POST` | `/api/contact` | (Legacy) Direct contact submission. |

---

## 📉 Dashboard Unified (`/api`)
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard` | Optimized unified dashboard payload. |
