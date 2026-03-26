# API Endpoints (Pulpy Reporting Portal)

Base URL: `http://localhost:5000`

Auth: JWT Bearer required for `/api/admin/**` and `/api/auth/profile`. Public routes: `/click`, `/imp`, `/postback`, `/health`, `/api/auth/register`, `/api/auth/login`.

Common success format (typical): 
```json
{ "success": true, "data": { ... }, "message": "optional" }
```
Common error format (typical):
```json
{ "success": false, "error": "Bad Request", "message": "details", "details": [] }
```

## Navigation
- **Authentication**: register/login/profile endpoints for admin JWT.
- **Advertisers / Publishers / Offers / Assignments**: core admin resources (JWT).
- **Reports**: dashboard + summary/detailed reporting endpoints (JWT).
- **Tracking (Public)**: `GET /click`, `GET /imp` for click + impression tracking.
- **Postback (Public)**: `GET /postback`, `POST /postback` to record conversions and (only on `approved`) fire publisher postback callback.
- **Event API (Public)**: `GET /event`, `POST /event` to track events; if the event equals the offer’s `payout_event`, it is strictly stored once per click and also queues/creates a conversion.

## Authentication
- `POST /api/auth/register`  
  Body: `{ "email": string, "name": string, "password": string, "role": "admin" }`  
  Response: 201 with token in `data.token`.
- `POST /api/auth/login`  
  Body: `{ "email": string, "password": string }`  
  Response: 200 with token in `data.token`.
- `GET /api/auth/profile` (JWT)  
  Response: admin profile.

## Advertisers (JWT)
- `POST /api/admin/advertisers`  
  Required body: `name, email, country`. Optional: `company_name, website, notes, status`.
- `PATCH /api/admin/advertisers/:id`  
  Body: any of the advertiser fields.
- `GET /api/admin/advertisers`  
  Query: `status?, country?, search?, page?, limit?`
- `GET /api/admin/advertisers/:id`
- `DELETE /api/admin/advertisers/:id` (soft delete -> status inactive)

## Publishers (JWT)
- `POST /api/admin/publishers`  
  Required: `email`. Optional: `mobile, first_name, last_name, company_name, position, address, state, country, zip_code, tax_invoice_details (obj), payment_terms (obj), global_postback_url, status`.
- `PATCH /api/admin/publishers/:id`  
  Body: any publisher fields.
- `GET /api/admin/publishers`  
  Query: `status?, email?, company_name?, page?, limit?`
- `GET /api/admin/publishers/:id`
- `DELETE /api/admin/publishers/:id` (soft delete)

## Offers (JWT)
- `POST /api/admin/offers`  
  Required: `advertiser_id, name, offer_currency, country, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url`.  
  Optional: description, category, status, preview_url, token_type, macros_json, date/time fields, targeting JSONs, caps, fallback, postback configs, etc.
- `PATCH /api/admin/offers/:id`  
  Body: any offer fields (all optional).
- `PATCH /api/admin/offers/:id/status`  
  Body: `{ "status": "live|paused|draft" }`
- `GET /api/admin/offers`  
  Query: `status?, advertiser_id?, category?, search?, page?, limit?`
- `GET /api/admin/offers/:id`
- `DELETE /api/admin/offers/:id`

## Assignments (JWT)
- `POST /api/admin/assignments`  
  Body: `{ "publisher_id": number, "offer_id": number, "payout_override"?: number, "cap_override"?: number, "notes"?: string }`
- `GET /api/admin/assignments`
- `GET /api/admin/assignments/:id`
- `GET /api/admin/assignments/:id/tracking-url`
- `DELETE /api/admin/assignments/:id`

## Reports (JWT)
- `GET /api/admin/reports/dashboard`
- `GET /api/admin/reports/summary`  
  Query: `date_from?, date_to?, offer_id?, publisher_id?, page?, limit?`
- `GET /api/admin/reports/detailed`  
  Query: `date_from?, date_to?, offer_id?, publisher_id?, page?, limit?`

## Tracking (Public)
- `GET /click`  
  Query required: `offer_id`, `pub_id`; optional: `tid, rcid, source_id, device_id, google_id, android_id`.  
  Response: 302 redirect to offer URL with `click_id` appended.
- `GET /imp`  
  Query required: `offer_id`, `pub_id`; optional referrer headers.

## Postback (Public)
- `GET /postback`  
  Query typical: `click_id, rcid, amount, status`
- `POST /postback`  
  Body typical: `{ "click_id": string, "rcid": string, "amount": number, "status": string }`

### Postback (Public) — Detailed Behavior (Isolated)
- **Purpose**: Record a conversion (and optionally fire publisher callback) using the `/postback` endpoint.
- **Isolation rule**: The Postback flow is **conversion-first**. It does **not** depend on the `events` table and does not require any “event API” usage to work.
- **Accepted inputs (common)**
  - **Identifiers**: `click_id` (preferred) or `rcid` (required if no `click_id`)
  - **Financial**: `amount` (optional; falls back to offer advertiser amount when missing/invalid)
  - **Status**: `status` (optional; normalized)
  - **Event fields** (optional): `event` / `event_type`, `event_id` / `txid`
    - If provided, the system may also track a behavioral event row, but conversion creation is still driven by payout logic (see below).
- **Conversion creation rules**
  - **Offer must be live and within start/end date** (otherwise conversion is rejected/blocked).
  - **Cap checks apply** (offer-level and assignment/publisher-level). If caps are hit, conversion may be recorded as `rejected_cap` with payout = 0.
  - **One click → one conversion**: the conversions layer is enforced to avoid multiple conversions per `click_uuid` (DB uniqueness check), plus an additional dedupe by `rcid` + `offer_id` + `tenant_id`.
  - **Publisher postback firing policy (strict)**
    - Publisher postback (affiliate callback URL) is fired **only when conversion status is exactly `approved`**.
    - For any non-approved status (`pending`, `rejected`, `rejected_cap`, `click_expired`, etc.), publisher postback is **not fired**.
    - Idempotency is applied via `affiliate_postback_fired` so an approved conversion doesn’t fire repeatedly.
- **Notes about “event” fields in postback**
  - Postback can accept `event` / `event_type` and store it into `events` as a behavioral record.
  - **But** conversion creation still happens only when the incoming event matches the offer’s configured `payout_event`. If it’s a non-payable event, the system tracks the event and **skips** conversion creation.

## Event API (Public) — `/event`
- `GET /event` (backward compatibility)
- `POST /event`

### Event API — Detailed Behavior
- **Purpose**: Track arbitrary events for a click (behavioral analytics), and if the event is the offer’s configured `payout_event`, it will also **queue/create a conversion** (writes to `conversions`).
- **Tenant**: Tenant context is resolved from the request subdomain/Host header (same as other public tracking endpoints).
- **Required inputs**
  - **click_id**: the system click UUID generated by `/click`
  - **event**: event name (example: `purchase`, `lead`, `signup`)
- **Optional inputs**
  - **event_id**: external idempotency key for the event (recommended when client may retry)
  - **amount**: numeric event value; used as conversion amount when payable
  - **metadata**: JSON object or JSON string (stored into `events.metadata` / analytics)
- **What gets written**
  - **events table**: one behavioral row per unique \((click_uuid, event_name, event_id_norm)\).
  - **event analytics / daily aggregates**: written for reporting (when enabled/migrations present).
  - **conversions table**: only when this event is payable (i.e., `event === offers.payout_event`), and only if a conversion for that click does not already exist.
- **Payable event definition**
  - Each offer has `offers.payout_event` (default: `purchase`).
  - If incoming `event` equals `payout_event`, then the event is **payable** and a conversion is created/queued.
- **Conversion behavior for payable events**
  - If there is already a conversion row for this `click_uuid` (within tenant), the event is still tracked, but conversion creation is skipped.
  - Otherwise, conversion is queued via Redis (`conversion:{click_uuid}` + `stream:conversions`) and later persisted to DB by the conversion pipeline.
- **Publisher callback from Event API**
  - When an event is inserted (not a duplicate) and a callback URL is configured, the system can fire an **event postback** (separate from “conversion approved” postback).
  - This is independent from conversion-status postback rules.

### Event Deduplication (Same event fired multiple times)
- **Current behavior**: If the **same event type** fires again for the **same click_id**:
  - It will be stored **only one time** **when** the idempotency key matches \((click_uuid, event_name, event_id_norm)\).
  - `event_id_norm` is derived from `event_id`:
    - If you send the same `event_id` repeatedly → it’s a duplicate → only one row.
    - If you omit `event_id` repeatedly → it normalizes to a constant (`__none__`) → only one row.
    - If you send different `event_id` values each time → **each one is stored** as a separate event row.
  - **Special rule (industry-safe payout event)**: if `event` equals the offer’s `payout_event`, it is forced to be **strictly once per click_id** (retries with different `event_id` will still dedupe to a single stored payout event).

### Is “always store duplicates” a good approach?
- **For reliability / retries**: **No** — you generally want idempotency so client retries don’t inflate counts.
- **For “true repeated behavior” analytics**: **Sometimes yes**, but then you should store a separate per-hit identifier (like `event_id`/`txid` or a client-generated `event_instance_id`) so you can distinguish real repeats from retries.
- **Recommended practice here**: keep the current unique key (safe idempotency), and if you need repeated events, require the caller to send a unique `event_id` for each real occurrence.

## Test Conversion (JWT)
- `POST /api/admin/test-conversion`  
  Body: `{ "affiliate_url": "http://localhost:5000/click?offer_id=1&pub_id=1&tid=test123" }`

## Health
- `GET /health` -> `{ "status": "ok", "timestamp": "..." }`


