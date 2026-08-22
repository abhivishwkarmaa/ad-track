# Track MyAds — Client User Guide

**Private Ad Network Command Center**  
Complete guide for day-to-day operations: advertisers, offers, publishers, assignments, tracking, postbacks, logs, and reports.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [How the Network Works (Overview)](#2-how-the-network-works-overview)
3. [Advertisers](#3-advertisers)
4. [Offers](#4-offers)
5. [Publishers (Affiliates)](#5-publishers-affiliates)
6. [Assignments & Tracking Links](#6-assignments--tracking-links)
7. [Traffic Flow (Click → Conversion)](#7-traffic-flow-click--conversion)
8. [Postbacks](#8-postbacks)
9. [Test Postback Tool](#9-test-postback-tool)
10. [Dashboard](#10-dashboard)
11. [Reports](#11-reports)
12. [Live Logs & Detail Views](#12-live-logs--detail-views)
13. [Caps, Targeting & Fallback](#13-caps-targeting--fallback)
14. [Account Settings](#14-account-settings)
15. [Quick Checklist (Go-Live)](#15-quick-checklist-go-live)
16. [Glossary](#16-glossary)

---

## 1. Getting Started

### 1.1 Login

1. Open your portal URL (example: `https://yourcompany.trackmyads.com`).
2. Sign in with your admin email and password.
3. On first login, if prompted, **change your password**.

**Forgot password:** use **Forgot Password** on the login page → OTP is sent to your email → set a new password.

### 1.2 Main Navigation

| Menu | What it is for |
|------|----------------|
| **Dashboard** | KPIs, charts, top offers / publishers |
| **Offers** | Create and manage campaigns |
| **Reports / Logs** | Aggregated reports + CSV export |
| **Live Logs** | Real-time click & conversion stream |
| **Publishers** | Manage affiliates / partners |
| **Test Postback** | End-to-end postback testing |
| **Advertisers** | Manage advertiser accounts |
| **Assignment** | Link offers ↔ publishers + tracking URLs |
| **Account / Settings** | Profile, password, report timezone |

---

## 2. How the Network Works (Overview)

This is a **private network** model (not an open marketplace).

```
Advertiser  →  Offer  →  Assignment  →  Publisher
                              ↓
                      Tracking Link
                              ↓
                    User Click (/click)
                              ↓
              Advertiser Postback (/postback)
                              ↓
         Publisher Postback (only if Approved)
```

**Recommended order every time you launch a campaign:**

1. Create **Advertiser**
2. Create **Offer** (revenue, payout, targeting, caps, URLs)
3. Create **Publisher** (and set global postback URL if needed)
4. Create **Assignment** (offer → publisher) → copy tracking link
5. Share tracking link with publisher
6. Configure advertiser S2S postback to your platform
7. Verify with **Test Postback** + **Live Logs**
8. Monitor **Dashboard** and **Reports**

---

## 3. Advertisers

**Path:** Advertisers → Manage / New / Edit / Detail

Advertisers are the clients paying you for traffic/conversions.

### 3.1 Create an Advertiser

| Field | Required | Notes |
|-------|----------|-------|
| Email | Yes | Unique contact email |
| Name | Yes | Contact / manager name |
| Company Name | Yes | Advertiser company |
| Country | No | Preset list or custom |
| Website | No | Company website |
| Notes | No | Internal notes |
| Status | — | `active` or `inactive` |

### 3.2 Manage Advertisers

- Search and filter by status
- Toggle Active / Inactive
- Open **Detail** to see offers and performance linked to that advertiser
- Soft-delete / deactivate when no longer needed

---

## 4. Offers

**Path:** Offers → List / New / Edit / Detail

An offer is a campaign with pricing, schedule, destination URL, targeting, and caps.

### 4.1 Offer Status

| Status | Meaning |
|--------|---------|
| **Live** | Accepting traffic |
| **Paused** | Temporarily stopped |
| **Draft** | Not ready for traffic |
| **Archived** | Soft-deleted / hidden from list (tracking history retained) |

**Visibility options:** `PUBLIC` | `PUBLICREQUIREAPPROVAL` | `PRIVATE`

### 4.2 Basic Details

| Field | Notes |
|-------|-------|
| Name | Required |
| Description | Optional |
| Offer Currency | USD, EUR, GBP, INR, AUD, CAD, JPY, AED, … |
| Country / Timezone | Campaign geo + schedule context |
| Advertiser | Required — link to advertiser |
| Category | Shopping, Finance, Gaming, E-commerce, custom, … |
| Offer Visibility | Public / Private / Approval required |
| Billing Flow | Metadata (Preview Link, OTP, DOI, Captcha, etc.) |
| Billing Type | Billable / Non-billable |
| Carrier Name | Optional |

### 4.3 Pricing

| Side | Fields | Models |
|------|--------|--------|
| Advertiser (Revenue) | `advertiser_model` + `advertiser_amount` | CPA, CPC, CPL, CPI, CPS, CPM |
| Publisher (Default Payout) | `affiliate_model` + `affiliate_amount` | Same model set |

> Per-publisher payout can later be overridden on the **Assignment**.

### 4.4 Schedule

- Start date / time
- End date / time
- Empty times = available **24/7** within the date range (IST-based schedule handling)

### 4.5 URLs & Tokens

| Field | Notes |
|-------|-------|
| Offer URL | Required destination (landing / store / checkout) |
| Preview URL | Optional preview |
| Token type | `hasoffers` or `affise` style mapping |
| Token mapping | Map advertiser params (`aff_sub`, `source`, `google_aid`, …) to platform tokens (`{tid}`, `{ip}`, `{offerid}`, `{aff_id}`, …) |

Use **Test Offer Link** on the form to sanity-check the destination.

### 4.6 Tracking URL Parameters (`offer_params`)

Add custom query params appended to generated tracking links:

- `param_key` (e.g. `sub1`, `utm_source`, `ad_id`)
- `is_required`
- `default_value`

Suggested keys: `sub1`–`sub5`, UTM fields, placement IDs.

Required params appear as `{param}` placeholders on the tracking URL so publishers can fill them.

### 4.7 Targeting (ALLOW / BLOCK)

Configure allow or block lists for:

- IP
- Country
- Browser
- Device
- OS
- ISP
- Carrier / Network
- City

Failed targeting can send traffic to **Fallback** (see Section 13).

### 4.8 Capping & Budget

| Field | Options |
|-------|---------|
| Capping type | `none` / `budget` / `conversion` |
| Duration | `daily` / `weekly` / `monthly` |
| Amount | Cap value |
| Cap action | `stop` (404) / `reject` (track as rejected, payout 0) / `fallback` |

### 4.9 Fallback

When cap action = **fallback** (or traffic is rejected by rules):

| Fallback type | Behavior |
|---------------|----------|
| Offer | Redirect to another offer |
| Custom | Redirect to a custom URL |

### 4.10 Offer Detail Screen

From Offer Detail you can:

- Review performance summary
- Assign publishers **inline**
- Copy tracking URLs
- See recent conversions

### 4.11 Public Offer ID

Each offer has a **public_offer_id** used in tracking links:

```text
/click?offer_id={public_offer_id}&pub_id={public_publisher_id}
```

---

## 5. Publishers (Affiliates)

**Path:** Publishers → Manage / New / Edit / Detail  
UI label: **Publishers** (backend: affiliates / publishers).

### 5.1 Create a Publisher

| Field | Required | Notes |
|-------|----------|-------|
| Email | Yes | Login / contact |
| First Name | Yes | Display name |
| Company Name | No | Company |
| Country | No | Optional |
| Password | Yes (create) | Min 6 characters; optional on edit |
| Global Postback URL | No* | S2S URL to notify publisher of conversions |
| Status | — | `pending` / `active` / `suspended` |

\* Required if you want automatic publisher postbacks and for the **Test Postback** tool.

### 5.2 Global Postback URL (Publisher)

Example:

```text
https://publisher-domain.com/postback?click_id={click_id}&payout={payout}&status={status}
```

**Common macros:**

| Macro | Meaning |
|-------|---------|
| `{click_id}` | Affiliate’s click ID (`tid`) returned to them |
| `{affiliate_click_id}` | Same as above (explicit name) |
| `{payout}` | Publisher payout amount |
| `{amount}` | Advertiser revenue / conversion amount |
| `{status}` | Conversion status |
| `{conversion_id}` | Platform conversion UUID |
| `{rcid}` | Advertiser / network click reference if used |
| `{tid}` | Affiliate transaction / click id |

> Publisher postback is fired **only when conversion status is `approved`**.

### 5.3 Publisher Detail

Shows profile + performance block for that publisher.

---

## 6. Assignments & Tracking Links

**Path:** Assignment → Manage / New / Edit  
Also available from **Offer Detail**.

Assignments are the heart of the private network: an offer is only live for a publisher after you assign them.

### 6.1 Create Assignment

1. Select one **Offer**
2. Select one or more **Publishers**
3. Optionally set per-publisher overrides
4. Save → system generates a tracking URL per assignment

### 6.2 Per-Publisher Assignment Fields

| Field | Purpose |
|-------|---------|
| Payout Override | Custom payout instead of offer default |
| Conversion Approval % | 0–100% auto-approve rate (rest stay pending) |
| Capping (type / duration / amount / action) | Publisher-level caps |
| Fallback | Offer or custom URL when capped |
| Callback URL | Assignment-specific postback (overrides global if set). Should include `{click_id}` or `{rcid}` |
| Offer / Destination URL override | Per-assignment landing override |
| Notes | Internal notes |
| Status | `active` / `inactive` / `suspended` (edit may also show `paused`) |

### 6.3 Tracking Link Format

```text
https://YOUR-TRACKING-DOMAIN/click?offer_id=PUBLIC_OFFER_ID&pub_id=PUBLIC_PUBLISHER_ID
```

Optional extra params from offer settings may append as placeholders, e.g.:

```text
&sub1={sub1}&utm_source={utm_source}
```

**How to get the link:**

- Assignment Manage → Copy tracking URL  
- Offer Detail → assigned publishers  
- Assignment Edit → tracking URL panel  

Send this link to the publisher — they use it as their campaign URL.

---

## 7. Traffic Flow (Click → Conversion)

### 7.1 Click (`/click`)

When a user opens the tracking link, the platform:

1. Validates offer + publisher + assignment status  
2. Checks schedule window  
3. Applies targeting rules  
4. Applies offer / assignment caps  
5. Records the click (IP, geo, ISP, device, OS, browser, referrer, UA, tid/rcid, extra params)  
6. Redirects (302) to the offer URL or fallback  

Clicks are queued for high speed (non-blocking redirects).

### 7.2 Impression (`/imp`)

Optional impression tracking endpoint for view-based measurement.

### 7.3 Conversion (`/postback`)

Advertiser (or their tracker) fires your postback URL with the click identifier. The platform attributes the conversion, applies approval %, caps, and click expiry, then may fire the publisher postback if status is **approved**.

---

## 8. Postbacks

There are **two** postback directions.

### 8.1 Advertiser → Your Platform (Inbound)

**Endpoint:** `GET` or `POST` `/postback`

Typical parameters:

| Param | Purpose |
|-------|---------|
| `click_id` | Platform click ID (or mapped id from your token setup) |
| `rcid` | Alternate click reference (if used) |
| `amount` | Conversion / revenue amount (optional depending on model) |
| `status` | Advertiser-reported status (if provided) |

**What happens internally:**

1. Look up click (cache then database)
2. Validate tenant / offer / publisher
3. Check click expiry
4. Apply caps & approval percentage
5. Create conversion with a status
6. If status is exactly **`approved`** → fire publisher postback once (idempotent)

### 8.2 Conversion Statuses

| Status | Meaning | Publisher postback? |
|--------|---------|---------------------|
| `approved` | Counted for payout | **Yes** |
| `pending` | Held by approval % (or awaiting review) | No |
| `rejected` | Rejected | No |
| `rejected_cap` | Cap exceeded with reject action | No |
| `click_expired` | Postback arrived after click TTL | No |

**Important policy:** Publisher postback fires **only** for status `approved`.  
If you later manually approve a pending/rejected/expired conversion, the publisher postback may fire at that time.

### 8.3 Platform → Publisher (Outbound)

Priority:

1. Assignment **callback_url** (if set)
2. Else publisher **global_postback_url**

Macros are replaced and a GET request is sent to the publisher URL.

### 8.4 Manual Approval

From Live Logs / Conversion Detail / Reports:

- You can **Approve** eligible conversions (`pending`, `click_expired`, `rejected`, `rejected_cap` as allowed by UI)
- Status becomes `approved`
- Payout is calculated
- Publisher postback is fired (if configured)

---

## 9. Test Postback Tool

**Path:** Publishers → Test Postback (`/affiliate/postback-test`)

Use this before going live with a publisher.

### 9.1 Prerequisites

- Publisher exists and is active (or testable)
- Publisher has a **Global Postback URL** configured
- Offer exists and is assigned to that publisher
- Tracking link is available

### 9.2 Steps

1. Select **Publisher** and **Offer**
2. Paste / confirm the **tracking URL**
3. Optionally set `rcid` / `tid`
4. Start the test session
5. Open the tracking URL (simulate a real click)
6. Platform detects the click and fires a **test** publisher postback
7. Review result: success / failed / expired

### 9.3 Session Statuses

`pending` → `processing` → `success` / `failed` / `expired`

### 9.4 What to verify

- Click appears in **Live Logs**
- Test postback hits the publisher URL with correct macros
- Conversion (if fired) shows correct status and payout fields

---

## 10. Dashboard

**Path:** Dashboard (`/`)

### KPIs (timezone-aware date filter)

- Total Clicks  
- Total Conversions  
- Approved / Pending / Click Expired  
- Total Revenue  
- Approved Payout  
- Profit  

### Widgets

- Performance chart (area)
- Live offers
- Top offers / top affiliates / top countries
- Offer & publisher statistics tables
- Period comparison (current vs previous)

Use the date / timeline controls to switch windows. Report timezone comes from Account Settings.

---

## 11. Reports

**Path:** Reports / Logs → Detailed Reports (`/reports`)

### 11.1 Date Presets

Today · Yesterday · This Week · This Month · Last Month · Custom range

### 11.2 Filters

- Offer, Publisher, Advertiser  
- Conversion status  
- Search  
- Source IP, X-Forwarded-For, Referrer, Auth token  
- Traffic type: All / Direct / Referred  

### 11.3 Group By Dimensions

Offer, Publisher, Advertiser, Date, Hour, IP, Country, ISP, City, Region, TID, User Agent, Domain, Device Type, OS, Browser, Click UUID, RCID, Referer, X-Forwarded-For, Auth Token

### 11.4 Metrics

- Clicks, Unique Clicks, Impressions  
- Total / Approved / Pending / Rejected Conversions  
- Advertiser Payout (Revenue)  
- Publisher Total / Pending / Approved Payout  
- Profit  

### 11.5 Export

Server-side **CSV export** of the full filtered dataset.

---

## 12. Live Logs & Detail Views

### 12.1 Live Logs

**Path:** Live Logs (`/live-logs`)

- Tabs: **Clicks** | **Conversions**
- Filters: offer, publisher, date range, limit
- Auto-refresh roughly every 5 seconds
- Manual **Approve** on eligible conversions
- Click a row to open detail

### 12.2 Click Detail

`/logs/click/:clickUuid`

Shows:

- Click UUID, TID, RCID, timestamps  
- Linked conversion status (if any)  
- Pass-through `extra_params`  
- Network & device fingerprint  
- Linked Offer / Publisher / Assignment cards  

### 12.3 Conversion Detail

`/logs/conversion/:conversionUuid`

Shows:

- Conversion UUID & status  
- Revenue (`amount`) and publisher `payout`  
- IP, test flag  
- `affiliate_postback_fired` indicator  
- Advertiser postback payload (JSON)  
- Approve button when allowed  
- Linked click + entity cards  

> There is no separate “Postback Logs” menu item. Check conversion detail for whether the publisher postback was fired, and use Test Postback for controlled verification.

---

## 13. Caps, Targeting & Fallback

### 13.1 Where rules apply

| Layer | Caps | Targeting | Payout | Status |
|-------|------|-----------|--------|--------|
| Offer | Budget or conversion; daily/weekly/monthly | IP, country, device, OS, browser, ISP, carrier, city | Default revenue & payout | live / paused / draft |
| Assignment | Same cap model at publisher level | — | `payout_override` | active / inactive / suspended |
| Publisher | — | — | Via approved postback | pending / active / suspended |
| Conversion | Cap → `rejected_cap` | Fail at click time → fallback / reject | Payout only when approved | approved / pending / rejected / … |

### 13.2 Cap actions

| Action | Behavior |
|--------|----------|
| **stop** | Block traffic (e.g. 404) |
| **reject** | Still track; conversion rejected; payout 0 |
| **fallback** | Redirect user to another offer or custom URL |

### 13.3 Approval percentage

On assignment, set **Conversion Approval %** (0–100).

- Example: `80` → ~80% of attributed conversions auto-approve; rest stay `pending` until manual review.
- Only **approved** conversions pay out and fire publisher postback.

---

## 14. Account Settings

**Path:** Account / Settings

| Setting | Notes |
|---------|-------|
| Full name, email, company, phone | Profile |
| Report timezone | Controls Dashboard / Reports day boundaries |
| Change password | Via OTP verification |
| Logout | Confirmed logout; session uses JWT refresh |

White-label branding (company name / logo) comes from your tenant profile where enabled.

---

## 15. Quick Checklist (Go-Live)

Use this for every new campaign:

- [ ] Advertiser created and **active**
- [ ] Offer created: URLs, revenue, default payout filled
- [ ] Offer status set to **Live**
- [ ] Targeting & caps reviewed
- [ ] Fallback configured (recommended)
- [ ] Publisher created and **active**
- [ ] Publisher **global postback URL** set (with macros)
- [ ] Assignment created (offer ↔ publisher)
- [ ] Payout override / approval % set if needed
- [ ] Tracking link copied and shared with publisher
- [ ] Advertiser inbound postback URL configured on their side
- [ ] **Test Postback** run successfully
- [ ] Click + conversion verified in **Live Logs**
- [ ] Numbers checked on **Dashboard** / **Reports**

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **Advertiser** | Client who pays for conversions / traffic |
| **Publisher / Affiliate** | Partner who sends traffic |
| **Offer** | Campaign with pricing, URL, targeting, caps |
| **Assignment** | Link between one offer and one publisher |
| **Tracking Link** | Click URL unique to offer + publisher |
| **S2S Postback** | Server-to-server conversion notification |
| **Revenue** | What advertiser pays you (`amount`) |
| **Payout** | What you pay the publisher |
| **Profit** | Revenue − Payout |
| **Cap** | Limit on budget or conversions over a period |
| **Fallback** | Redirect when traffic is rejected or capped |
| **TID** | Publisher’s own click / transaction ID |
| **RCID** | Alternate click reference ID |
| **Click UUID** | Internal platform click identifier |
| **Approved** | Conversion that counts for payout & fires publisher postback |

---

## Support Notes

- Always test with **Test Postback** + **Live Logs** before scaling traffic.
- If dashboard numbers look “stale,” refresh filters/timezone and confirm offer/assignment status is Live/Active.
- Publisher postbacks never fire for non-approved statuses (`pending`, `rejected`, `rejected_cap`, `click_expired`, etc.).
- For production incidents, capture: tracking URL, click UUID, conversion UUID, offer ID, publisher ID, and approximate timestamp (with timezone).

---

*Document version: 1.0 · Product: Track MyAds / Pulpy Reporting Portal*
