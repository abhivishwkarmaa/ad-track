# Event-Based & Multi-Goal Tracking System Documentation

Complete architectural and operational documentation for the **Multi-Event / Goal-Based Tracking System** implemented in **Track MyAds (Pulpy)**.

---

## 1. System Overview & Core Objectives

Modern performance marketing campaigns (e.g. Fintech, Gaming, E-commerce, Subscriptions) are rarely single-step conversions. A user journey typically involves multiple milestones:
`App Install` ➔ `User Registration` ➔ `KYC Complete` ➔ `First Deposit (FTD)` ➔ `Subsequent Deposits`.

### Key Problems Solved:
1. **Primary Goal vs. Funnel Signals**:
   - Only **one** milestone is usually the payable **Primary Goal** (e.g. `Registration` or `First Deposit`).
   - Other events (e.g. `KYC`, `Install`) are **Funnel Signals** needed for optimization and publisher feedback without inflating the primary conversion count or eating offer caps.
2. **Independent Payouts & Revenues**:
   - Each event can specify its own Advertiser Revenue and Publisher Payout (or $0.00 for pure tracking signals).
3. **Repeat Events**:
   - Certain events (like `deposit`) can happen multiple times per user (`allow_multiple = 1`).
4. **100% Backward Compatibility**:
   - Standard CPA/CPI offers without multi-events continue to work seamlessly. If an advertiser fires a postback without an event parameter, it gracefully defaults to `default` and uses base offer pricing.

---

## 2. Database Architecture & Schema

All migrations are located in `Pulpy_Reporting_Portal_Backend/src/db/migrations/` and are idempotent (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

### 2.1 `offer_events` (Configured Goals per Offer)
Defines which events an offer tracks and their financial terms:
```sql
CREATE TABLE IF NOT EXISTS `offer_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `offer_id` INT NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `title` VARCHAR(128) NOT NULL,
  `advertiser_amount` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `affiliate_amount` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `allow_multiple` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active','paused','archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_offer_event` (`offer_id`, `event_name`, `tenant_id`),
  INDEX `idx_offer_events_tenant` (`tenant_id`, `offer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 `event_logs` (Full Journey Audit Trail)
Records **every event received** for every click, giving a full timeline of the user journey:
```sql
CREATE TABLE IF NOT EXISTS `event_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `offer_id` INT NOT NULL,
  `publisher_id` INT NOT NULL,
  `click_uuid` VARCHAR(128) NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `payout` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `is_conversion` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('approved','declined','pending','duplicate','click_expired') NOT NULL DEFAULT 'approved',
  `ip` VARCHAR(45) NULL,
  `postback_payload` TEXT NULL,
  `affiliate_postback_fired` TINYINT(1) NOT NULL DEFAULT 0,
  `affiliate_postback_status` VARCHAR(32) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_event_logs_click` (`click_uuid`),
  INDEX `idx_event_logs_offer_event` (`offer_id`, `event_name`),
  INDEX `idx_event_logs_tenant` (`tenant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 `daily_offer_event_stats` (Reporting Aggregation)
Aggregates daily performance broken down by each specific event milestone:
```sql
CREATE TABLE IF NOT EXISTS `daily_offer_event_stats` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `offer_id` INT NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `day` DATE NOT NULL,
  `conversions` INT NOT NULL DEFAULT 0,
  `approved_conversions` INT NOT NULL DEFAULT 0,
  `pending_conversions` INT NOT NULL DEFAULT 0,
  `rejected_conversions` INT NOT NULL DEFAULT 0,
  `revenue` DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  `payout` DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  `profit` DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_day_offer_event` (`tenant_id`, `offer_id`, `event_name`, `day`),
  INDEX `idx_stats_day` (`day`, `offer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.4 `conversions` Table Enhancement
- Added column: `event_name VARCHAR(64) NOT NULL DEFAULT 'default'`
- Ensures all primary conversions record which event completed the conversion.

---

## 3. Backend Logic & Execution Flow

```
                      Advertiser Hits Postback URL
                                   │
                                   ▼
                   Extract `event` query parameter
              (query.event || query.event_name || 'default')
                                   │
                                   ▼
             Lookup `offer_events` table (or Redis cache)
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
        `is_primary = true`                  `is_primary = false`
         (Primary Goal)                         (Funnel Signal)
                │                                     │
      • Write to `event_logs`               • Write to `event_logs`
      • Write to `conversions`              • SKIP `conversions` table!
      • Increment offer conversion cap      • Do NOT increment caps!
      • Update `daily_offer_event_stats`    • Update `daily_offer_event_stats`
      • Fire Publisher Postback             • Forward signal to publisher (if configured)
```

### 3.1 Event Parameter Extraction (`postbackService.js`)
Advertisers can send the event name under any standard alias:
```javascript
const rawEvent = query.event || query.event_name || query.goal || query.goal_id || 'default';
const eventName = String(rawEvent).trim().toLowerCase();
```

### 3.2 What happens when `event` is NOT passed?
- `eventName` becomes `'default'`.
- The system checks if there is an explicit `default` event in `offer_events`. If not, it uses the **Offer's Base Pricing** (`advertiser_amount` & `affiliate_amount` from `offers` table).
- It is treated as `isPrimary = true` (standard conversion).
- It enters `conversions` table and triggers publisher callback with standard payout.

### 3.3 Deduplication & Repeat Events
- If `allow_multiple = 0`: Deduplication query checks if the click has already logged this event. If yes, it safely returns `{ duplicate: true }`.
- If `allow_multiple = 1`: The event can be fired multiple times (e.g. repeat deposits).

---

## 4. Postback URL Specifications

### 4.1 Advertiser Postback Formats
* **Single-Event / Default Offer**:
  ```text
  http://<tenant>.domain.com/postback?click_id={click_id}
  ```
* **Multi-Event / Specific Goal**:
  ```text
  http://<tenant>.domain.com/postback?click_id={click_id}&event=registration
  ```
* **Dynamic Amount (e.g. percentage revshare on deposit)**:
  ```text
  http://<tenant>.domain.com/postback?click_id={click_id}&event=deposit&amount=50.00
  ```

### 4.2 Publisher Postback Formats
When triggering the publisher's callback URL, the system supports:
* `{tid}` / `{click_id}`: Publisher's original click ID
* `{payout}`: Calculated payout for this event
* `{event}` / `{event_name}`: Name of the event (`registration`, `deposit`, etc.)
* `{status}`: Conversion status (`approved`, `pending`, `declined`)

---

## 5. Frontend UI Components

### 5.1 Offer Management (`OfferEventsEditor.jsx`)
- **Quick Preset Buttons**: One-click addition of popular milestones (`App Install`, `User Registration`, `First Deposit`, `Repeat Deposit`, `KYC Verified`, `Lead Form`).
- **Primary Goal Radio Button**: Selects exactly **one** primary goal. All other events automatically become secondary funnel signals.
- **Granular Pricing**: Separate Advertiser Revenue and Publisher Payout for each event.
- **Repeat Toggle**: Checkbox to allow repeat postbacks for events like deposits.
- **Postback URL Helper**: Copyable URL template with macro placeholders.

### 5.2 Offer Detail View (`OfferDetail.jsx`)
- Displays an **Offer Events & Goals (Multi-Event Funnel)** card.
- Clear badges indicating:
  - 👑 **Primary Goal** vs. 📊 **Funnel Signal**
  - 🔁 **Repeat Allowed**
  - Revenue, Payout, Status

### 5.3 Click Detail View (`ClickDetail.jsx`)
- Displays the complete chronological **Events & Funnel Journey** table.
- Each event row includes:
  - `#` Step index
  - Event Name
  - Role: `👑 Primary Goal` (amber highlight) or `Funnel Signal`
  - Revenue & Payout recorded
  - Status badge (`Approved`, `Pending`, etc.)
  - Postback Fired indicator
  - Exact timestamp

---

## 6. Verification & Testing

### 6.1 Database Verification
To inspect event logs for a specific click on the VPS:
```bash
mysql -u root -p track_myads -e "
SELECT id, click_uuid, event_name, amount, payout, is_conversion, status, created_at 
FROM event_logs WHERE click_uuid = '<CLICK_UUID>' ORDER BY id ASC;
"
```

To verify that only the primary goal reached the conversions table:
```bash
mysql -u root -p track_myads -e "
SELECT id, click_uuid, event_name, amount, payout, status, created_at 
FROM conversions WHERE click_uuid = '<CLICK_UUID>';
"
```

### 6.2 Running Migrations
To ensure all tables and columns are up to date:
```bash
cd /var/www/ad-track/Pulpy_Reporting_Portal_Backend
npm run migrate
```
Output:
`All migrations executed successfully.` (or `skipped` on subsequent runs with 0 changes).

---

## 7. File Modification Summary

| Component | File Path | Changes Made |
| :--- | :--- | :--- |
| **Migrations** | `src/db/migrations/003_add_event_based_tracking.sql` | Created `offer_events`, `event_logs`, `publisher_event_postbacks`, added `conversions.event_name` |
| **Migrations** | `src/db/migrations/004_add_daily_offer_event_stats.sql` | Created `daily_offer_event_stats` |
| **Backend Service** | `src/services/offerEventsService.js` | CRUD, Redis caching, validation for offer events |
| **Postback Engine** | `src/services/postbackService.js` | Multi-event parsing, primary vs funnel routing, deduplication, stats tracking |
| **Offer Service** | `src/services/offer.service.js` | Integrated `offer_events` persistence and retrieval |
| **Validation Schema** | `src/schemas/offer.schema.js` | Schema validation rules for `offer_events` array |
| **Frontend Editor** | `src/pages/Offer/components/OfferEventsEditor.jsx` | Multi-event configuration UI with presets, primary goal radio, and copyable links |
| **Frontend Form** | `src/pages/Offer/components/OfferForm.jsx` | Integrated `OfferEventsEditor` into Create/Edit offer forms |
| **Offer Detail UI** | `src/pages/Offer/OfferDetail.jsx` | Added Offer Events & Goals breakdown card |
| **Click Detail UI** | `src/pages/Logs/ClickDetail.jsx` | Added Events & Funnel Journey timeline card |
