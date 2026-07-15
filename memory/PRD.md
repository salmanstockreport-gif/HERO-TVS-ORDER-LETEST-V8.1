# Kabir Auto Parts — Multi-Brand Ordering Portal

Kabir Auto Parts runs a Hero MotoCorp + TVS Motor parts dealership. This app lets the
owner and their employees manage parts orders for both brands from one portal, with a
shared inventory Excel file and role/permission-scoped access.

## What's built (July 2025)
- **Single login** (admin default: `admin` / `admin123`) → **system selector**
  (Hero red / TVS blue) → dashboard scoped to the chosen system.
- **Two ordering systems**:
  - Hero uses the existing Hero MotoCorp eCatalogue (`/api/hero/search`).
  - TVS uses the reverse-engineered `advantagetvs.com/PartEcommerceAPI/` (`/api/tvs/search`).
    Auth via `POST /Setting/tokenGeneration` (dealerId 10001, branchId 1, Type "Customer").
    Search via `GET /api/Catalouge/GetPartsearch?partid=...` — returns part_no, description, MRP.
- **Order namespacing**: order numbers become `HMC-YYYYMMDD-###` for Hero and
  `TVS-YYYYMMDD-###` for TVS. Concurrent-current-orders limit enforced per-system.
- **Shared inventory**: one Excel upload feeds both systems (staleness lock still applies).
- **Employee management** (owner-only, `/settings/employees`):
  - Add / edit / delete team accounts.
  - Toggle per-system access (Hero, TVS, or both).
  - Checkbox permissions: `orders_create_edit`, `orders_delete`, `orders_mark_sent`,
    `search_ecatalogue`, `inventory_view`, `inventory_upload`, `manage_important_parts`,
    `manage_mandatory_parts`, `change_discount`, `backup_restore`.
  - Owners always bypass permission checks.

## Data model changes
- `users` now has `role` (`owner`|`employee`), `systems`, `permissions`.
- `orders`, `important_parts`, `mandatory_parts` gained a `system` field. Composite unique
  index on `(system, part_no_norm)` for the parts lists.
- `settings.mandatory_parts_toggle` split into `mandatory_parts_toggle:hero` and
  `mandatory_parts_toggle:tvs`. Legacy key auto-migrated on startup.

## Frontend architecture
- `AuthContext` exposes `user`, `isOwner`, `hasPermission(key)`, `canAccessSystem(sys)`.
- `SystemContext` stores active system in localStorage, provides `meta` with brand
  colour / search endpoint / label.
- `axios` interceptor auto-attaches `system=<current>` to system-scoped endpoints.
- `Layout` sidebar shows an "Active system" pill that switches back to `/select-system`
  for owners (and multi-system employees).
