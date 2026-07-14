# Hero MotoCorp Parts Ordering System — PRD

## Problem Statement (verbatim)
- 2026-01-13: OPEN AND GET THIS READY TO DEPLOY - https://github.com/gharka882-cell/HMCL
- 2026-01-13: LOCK SYSTEM IF INVENTORY EXCEL IS NOT UPLOADED DAILY — DAILY INVENTORY EXCEL EXPIRES IN 24 HOURS. AFTER THAT A NEW FILE SHOULD BE UPLOADED.
- 2026-01-13: ADD IMPORTANT PART NUMBERS THAT WILL SHOW IN DASHBOARD IF THAT ITEMS GO BELOW CERTAIN QUANTITY THAT USER SHOULD SET.
- 2026-01-13: ADD MANDATORY PART NUMBERS THAT WOULD BE INCLUDED IN EVERY ORDER SHEET — KEEP THIS OPTION TOGGLEABLE.

## User Personas
- **Hero MotoCorp Dealer / Parts Manager (Kabir Auto Parts)** — logs in, uploads daily inventory to unlock the app, searches parts, builds order sheets (with auto-added mandatory parts if toggle is on), gets low-stock alerts on the dashboard for watch-listed parts, exports Excel/PDF.

## Architecture
- **Backend:** FastAPI + MongoDB (motor). JWT auth. Live Hero eCatalogue proxy. Inventory freshness enforced via `require_fresh_inventory` dependency (HTTP 423 on stale).
- **Frontend:** React 19 + Tailwind + Radix/Shadcn primitives, dark "Performance Pro" theme, Chivo + IBM Plex Sans + IBM Plex Mono. Global 423 interceptor broadcasts inventory-lock events; Layout renders full-screen lock overlay when stale.

## Core Requirements (static)
1. JWT username/password auth (admin seeded from env).
2. **24h inventory-freshness lock** on order/mutation endpoints and UI overlay when stale.
3. Live search of Hero eCatalogue + manual entry.
4. Global discount % → per-line Landed + Total.
5. Orders with unique number `HMC-YYYYMMDD-NNN`, Current/Sent tabs, dedupe, previous-order warnings.
6. Inventory Excel/CSV upload with configurable column mapping → stock badge; `last_uploaded_at` recorded.
7. **Important parts watch list** with per-part threshold → dashboard low-stock alerts.
8. **Mandatory parts list** auto-injected into every new order when global toggle is ON.
9. Excel + PDF export.
10. Dashboard with stats, low-stock alerts, recent orders.
11. Mobile-responsive UI.

## What's been implemented
### 2026-01-13 — Deployment sync
- Cloned `github.com/gharka882-cell/HMCL` into `/app`, rebuilt `backend/.env`, installed deps, confirmed services & login.

### 2026-01-13 — Stock visible BEFORE adding a part
- OrderEditor's Hero-search results now include a **Stock** column with the same badge styling as the items table: green (in-stock ≥ qty), yellow (low: stock &lt; qty), red (Out). Stock is fetched via `/api/inventory/lookup` for each result row when search returns.
- Manual-add form shows a **live stock hint badge** next to the Add button, debounced 350 ms after the user types a part number.

### 2026-01-13 — Set qty before adding a part
- OrderEditor: search-results table now has a **Qty** column (numeric input per row) that defaults to the part's MOQ (or 1). The user can edit it and press Enter or click Add — the item is added with that quantity applied to the line total. Toast now confirms `"Added <part> × <qty>"`. Manual-add form's Qty input was already in place.

### 2026-01-13 — Max 2 concurrent current orders
- Backend `MAX_CURRENT_ORDERS = 2`. `POST /api/orders` returns HTTP 409 with `{code:'current_orders_limit', message, limit, current_count}` when the limit is hit. `dashboard/stats` now returns `current_orders_limit` and `current_orders_full`.
- Frontend:
  - Dashboard: New Order button flips to a locked "Limit reached" state; a prominent red banner explains the block and links to `/orders/current`.
  - OrderEditor: when POST /orders returns 409 on isNew, a dedicated lock panel renders with the reason and CTAs to open current orders or go back to the dashboard.

### 2026-01-13 — Database export/import
- Backend:
  - `GET /api/db/export` streams a JSON snapshot of all 7 backup collections (users, settings, counters, orders, inventory, important_parts, mandatory_parts) with metadata (`app`, `version`, `exported_at`, `exported_by`).
  - `POST /api/db/import` (multipart) validates the `app: hero-parts-ordering` marker, drops each collection, re-inserts, and rebuilds indexes.
- Frontend Settings page:
  - "Database Backup" card with **Export database** (downloads timestamped JSON) and **Import database…** (opens a red confirmation panel showing file, exporter, collection counts, then wipes + restores + signs the user out).

### 2026-01-13 — 3 new features
- Backend (`server.py`):
  - `get_inventory_status()` + `require_fresh_inventory` dependency.
  - `GET /api/inventory/status` returns fresh/expiry data (24h TTL).
  - `require_fresh_inventory` gates POST `/api/orders`, PUT `/api/orders/{id}`, POST `/api/orders/{id}/mark-sent`, GET `/api/hero/search`.
  - Inventory upload records `settings.inventory_status.last_uploaded_at`.
  - `important_parts` collection + CRUD (`GET/POST/PUT/DELETE /api/important-parts`) with joined `current_stock` and `is_low`.
  - `mandatory_parts` collection + CRUD + `PUT /api/mandatory-toggle` (separate path to avoid FastAPI route conflict).
  - `POST /api/orders` auto-injects mandatory parts (with global discount applied) when toggle is on and incoming items list is empty.
  - `dashboard/stats` now returns `low_stock_alerts` + `inventory_status`.
- Frontend:
  - `useInventoryStatus` hook + global axios 423 interceptor → broadcasts inventory-lock events; also listens to `window "inventory:updated"` custom event for immediate cross-component refresh after upload.
  - `InventoryLockOverlay` full-screen lock (hidden only on `/inventory`).
  - `InventoryFreshnessBadge` + `InventoryBanner` in Layout.
  - New pages `ImportantParts` and `MandatoryParts` + sidebar links.
  - Dashboard low-stock alerts card.
  - Inventory upload dispatches `window "inventory:updated"` so badge/overlay update immediately.
- Testing: 36/36 backend tests passing (24 regression + 12 new), full frontend Playwright smoke pass. Zero critical or minor issues.

## Prioritized Backlog
- **P1**: Configurable TTL per dealer (currently fixed at 24h in `INVENTORY_TTL_HOURS`).
- **P1**: Bulk paste of multiple part numbers into an order editor.
- **P2**: Alert email/WhatsApp when low-stock threshold is breached.
- **P2**: Migrate FastAPI startup to lifespan handler; split router into modules.
- **P2**: Async httpx for Hero calls (currently blocking).
- **P3**: Aged-stock report; multi-user roles + audit log.

## Test credentials
See `/app/memory/test_credentials.md` — `admin / admin123`.
