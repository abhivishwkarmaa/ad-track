# Event-Based & Multi-Goal Tracking System

Code-accurate description of multi-event tracking in **Track MyAds (Pulpy)**.

This document matches the backend and frontend as of 2026-10-06, including the capping and stats fixes. Section 8 is the list of those fixes. Apply migration `006` before using repeat events.

---

## 1. What it does

A campaign can have several milestones on one click (`install`, `registration`, `kyc`, `first_deposit`, `deposit`).

- Exactly one configured event is the **primary goal** (`offer_events.is_primary = 1`). That event is written to `conversions`, consumes offer and publisher caps, and is the billable conversion.
- Every other configured event is a **funnel signal**. It is written to `event_logs` and `daily_offer_event_stats` only. It does not enter `conversions` and does not increment caps.
- Offers with an empty `offer_events` list never enter the multi-event branch. Dedup is still one conversion per click, payout still comes from the offer (or the assignment override), and `daily_offer_stats` plus the Redis offer/publisher counters are written the same way as before. `src/services/eventTracking.js` is used only when that offer has configured events. A missing `dedup_slot` column does not block the insert: the row is written without it.
- `amount` on the postback, when present, **replaces advertiser revenue** for that hit. Publisher payout stays the configured `affiliate_amount`. It is not a percentage of `amount`.

---

## 2. Schema (what the migrations actually create)

SQL migrations live in `Pulpy_Reporting_Portal_Backend/src/db/migrations/` and run via `npm run migrate`. `scripts/schema.sql` does **not** contain these tables. A database built only from `schema.sql` will not have event tracking until migrations 003–005 run.

`run_migration_events.js` is a separate one-off script. It also changes `conversions` unique indexes (`uniq_click_uuid` → `uniq_click_uuid_event`, `uniq_rcid_offer` → `uniq_rcid_offer_event`). Those index changes are **not** in the numbered SQL migrations.

### 2.1 `offer_events` — migration `003_add_event_based_tracking.sql`

`is_primary` is created here. Migration `005` adds the same column again only if it is missing.

```sql
CREATE TABLE IF NOT EXISTS `offer_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `offer_id` int NOT NULL,
  `event_name` varchar(64) NOT NULL,
  `title` varchar(128) DEFAULT NULL,
  `advertiser_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `affiliate_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `allow_multiple` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_offer_event` (`offer_id`, `event_name`),
  KEY `idx_tenant_offer_events` (`tenant_id`, `offer_id`),
  CONSTRAINT `fk_oe_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oe_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);
```

Migration 003 also adds `conversions.event_name varchar(64) NOT NULL DEFAULT 'default'` and index `idx_conversions_event_name`.

### 2.2 `daily_offer_event_stats` — migration `004_add_daily_offer_event_stats.sql`

```sql
CREATE TABLE IF NOT EXISTS daily_offer_event_stats (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  offer_id INT NOT NULL,
  event_name VARCHAR(64) NOT NULL DEFAULT 'default',
  day DATE NOT NULL,
  conversions INT UNSIGNED NOT NULL DEFAULT 0,
  approved_conversions INT UNSIGNED NOT NULL DEFAULT 0,
  pending_conversions INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_conversions INT UNSIGNED NOT NULL DEFAULT 0,
  revenue DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
  payout DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
  profit DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_offer_event_day (tenant_id, offer_id, event_name, day)
);
```

Offer detail stats do **not** read this table. They aggregate `event_logs` live (`offer.service.js` → `event_stats`). This table is written by the postback path and the conversion worker, and nothing in the reporting UI reads it.

### 2.3 `event_logs` — migration `005_add_event_logs_and_primary_goal.sql`

```sql
CREATE TABLE IF NOT EXISTS event_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL DEFAULT 0,
  click_uuid VARCHAR(128) NOT NULL,
  event_name VARCHAR(64) NOT NULL,
  amount DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
  payout DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
  is_conversion TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  ip VARCHAR(64) NULL,
  postback_payload JSON NULL,
  affiliate_postback_fired TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

Migration `006_fix_event_dedup_and_rcid.sql` adds nullable `event_logs.rcid` and `conversions.dedup_slot`. There is still no `affiliate_postback_status` column and no `publisher_event_postbacks` table. Publisher callbacks use the assignment `callback_url`, then the publisher `global_postback_url`. The same URL is used for every event.

---

## 3. Postback behaviour (`postbackService.js`)

Parameter aliases:

```javascript
const rawEvent = query.event || query.event_name || query.goal || query.goal_id || null;
let eventName = rawEvent ? String(rawEvent).trim().toLowerCase() : null;
```

`click_id` or `rcid` is required. Tenant comes from the request subdomain.

Events are loaded through `offerEventsService.getOfferEvents`, which returns **active** rows only (Redis cache, 300 seconds, key `ref:offer:events:{tenantId}:{offerId}`).

| Incoming postback | Offer has events | Result |
| :--- | :--- | :--- |
| No `event` | Has an active row | Mapped to the active `is_primary` row, or the first active row |
| `event` matches an active row | Yes | That row's pricing. `is_primary` decides conversion vs signal |
| `event` matches an inactive row, or matches nothing | Yes | Logged as `declined` with revenue and payout `0`. No publisher postback, no `conversions` row, no cap increment |
| Any / none | No events configured | `eventName` becomes the sent value or `default`. Treated as a primary conversion using offer pricing (assignment payout override applies only on this legacy path) |

Pricing when a row matches:

- Revenue = query `amount` if sent, otherwise `offer_events.advertiser_amount`
- Payout = `offer_events.affiliate_amount` (assignment override is **not** applied when an event row matches)

### 3.1 Dedup

Runs only when `allow_multiple` is false.

- Primary: `conversions` for that `click_uuid` + `event_name` + tenant, and for `rcid` + `offer_id` + `event_name` + tenant when `rcid` is present. A funnel row does not block the primary.
- Funnel signal: `event_logs` for that `click_uuid` + `event_name` + tenant, and `event_logs.rcid` when the column exists (migration `006`).
- A Redis `SET NX` claim (`dedup:event:{tenant}:{click}:{event}`, 900s) covers the gap before the row is committed.
- `conversions.dedup_slot` is `once` when repeats are off, and a new id when `allow_multiple` is on. Unique keys are `(tenant_id, click_uuid, event_name, dedup_slot)` and `(rcid, offer_id, event_name, dedup_slot)`. Migration `006` replaces `uniq_click_uuid` and `uniq_rcid_offer`.

### 3.2 What gets written

Caps run only for a primary goal, and only after the event is known. `rejected_cap` stores that `event_name`, payout `0`, and does not increment cap counters. Funnel signals never reach the cap check.

`daily_offer_event_stats` is incremented once, on the IST day (`getIstTodayYmd`), with approved / pending / rejected buckets filled from the final status:

- Funnel signal: written in `postbackService` when the signal is logged. Caps are not touched. `conversions` is not written. The response says the publisher postback was sent only when that call succeeded.
- Primary, Redis path: queued on `stream:conversions`. `conversionWorker.js` applies caps, then writes `daily_offer_stats` and `daily_offer_event_stats`. The postback path does not write those stats again. If the worker flips the row to `rejected_cap`, it updates the matching `event_logs` status and payout.
- Primary, DB path: cap check first, then one `conversions` insert (with `event_name`), one event log, one event-stats row, then cap counters.

Click older than 1 hour is `click_expired` with the resolved `event_name`, payout `0`, an `event_logs` row, and a single stats write. It does not increment caps.

Click older than 1 hour returns `click_expired` **before** event matching on the Redis path, and on the DB path it inserts `conversions` without `event_name` (column default `default`) and does not write `event_logs`.

Publisher URL macros that are actually replaced: `{click_id}` and `{affiliate_click_id}` (both map to the publisher `tid`), `{conversion_id}`, `{rcid}`, `{event}`, `{event_name}`, `{goal}`, `{payout}`, `{amount}`, `{status}`.

---

## 4. Configuration rules (`offerEventsService.js`)

`setOfferEvents` deletes every row for that offer + tenant, then inserts the new list.

- `event_name` is trimmed and lowercased. Allowed characters: letters, digits, `_`, `-`.
- Duplicate names in one payload are rejected.
- Primary selection: explicit `is_primary`, else the first row with `affiliate_amount > 0`, else index 0. Only that index is stored as primary.
- Status stored as `inactive` only when the payload says `inactive`; everything else is `active`. The offer form always sends `active`. There is no pause/archive status.

Validation schema: `src/schemas/offer.schema.js` (`offer_events` array). Persistence is in `offer.service.js` on create and update.

---

## 5. UI

| Screen | File | What it shows |
| :--- | :--- | :--- |
| Create / edit offer | `OfferEventsEditor.jsx` inside `OfferForm.jsx` | Presets: `install`, `registration`, `first_deposit`, `deposit` (repeat on), `kyc`, `lead`. One primary radio. Revenue, payout, allow-multiple. Copyable postback template |
| Offer detail | `OfferDetail.jsx` | Goals card (primary vs funnel, repeat, amounts) and an event breakdown from `stats.event_stats` |
| Click detail | `ClickDetail.jsx` | Chronological journey from `event_logs` via `logDetailService.getClickDetail` |
| Conversion detail | `ConversionDetail.jsx` | `event_name` (falls back to `default` in the UI) |
| Live logs | `LiveLogs.jsx` | Event label when `event_name` is not `default` |

---

## 6. Files

| Piece | Path |
| :--- | :--- |
| Migrations | `src/db/migrations/003_add_event_based_tracking.sql`, `004_add_daily_offer_event_stats.sql`, `005_add_event_logs_and_primary_goal.sql` |
| One-off index script | `run_migration_events.js` (not part of `npm run migrate`) |
| Event CRUD + cache | `src/services/offerEventsService.js` |
| Postback engine | `src/services/postbackService.js` |
| Async primary insert | `src/workers/conversionWorker.js` |
| Offer save / offer stats | `src/services/offer.service.js` |
| Click journey API | `src/services/logDetailService.js` |
| Payload schema | `src/schemas/offer.schema.js` |
| Editor / form | `src/pages/Offer/components/OfferEventsEditor.jsx`, `OfferForm.jsx`, `utils/offerFormPayload.js` |
| Offer + click UI | `src/pages/Offer/OfferDetail.jsx`, `src/pages/Logs/ClickDetail.jsx` |
| Flow script | `scripts/test_event_flow.js` |

---

## 7. How to inspect a click

```bash
mysql -u root -p track_myads -e "
SELECT id, click_uuid, event_name, amount, payout, is_conversion, status, affiliate_postback_fired, created_at
FROM event_logs WHERE click_uuid = '<CLICK_UUID>' ORDER BY id ASC;
"

mysql -u root -p track_myads -e "
SELECT id, click_uuid, event_name, amount, payout, status, created_at
FROM conversions WHERE click_uuid = '<CLICK_UUID>';
"
```

Migrations:

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate
```

---

## 8. Fixes applied (2026-10-06)

Migration `006` has to be applied before repeat events and `rcid` funnel dedup work:

```bash
cd Pulpy_Reporting_Portal_Backend
npm run migrate
```

| Issue | Current behavior |
| :--- | :--- |
| Unknown or inactive event paid the base CPA and skipped caps | Logged as `declined` with 0 revenue and 0 payout. No publisher postback, no `conversions` row, no cap increment |
| Funnel postback with `rcid` queried a missing column | `event_logs.rcid` comes from migration `006`. If that column is not there yet, the `rcid` lookup is skipped instead of failing the postback |
| Primary event stats counted twice, and pending/rejected stayed 0 | Redis primaries: only the conversion worker writes `daily_offer_event_stats`, after the cap decision. DB primaries and funnel signals: one write, with approved/pending/rejected buckets, on the IST day |
| DB publisher postback lost `{event}` | The conversion reload selects `event_name`. Cap-rejected and click-expired rows store `event_name` and an `event_logs` row |
| Dedup was once per click, and repeat primaries died on `uniq_click_uuid` | Dedup is per event name. `dedup_slot` plus migration `006` allows `allow_multiple` and keeps one slot when repeats are off. Caps still move only for a primary that is approved or pending |
| Inactive goals disappeared on the next offer save | `getOfferEvents` returns every status. Inactive goals are not payable |
| Funnel response always said the publisher was notified | The message says the postback was sent only when that HTTP call succeeded |
| Stats card guessed which event was primary | `event_stats.is_primary` comes from `offer_events.is_primary` |
