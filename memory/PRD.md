# HMCL Order System V2 — Deployment PRD

## Problem statement
Deploy the existing GitHub project (React + FastAPI + MongoDB,
https://github.com/salmanstockreport-gif/HMCL-ORDER-SYSTEM-V2) to both
**Emergent** (managed hosting) and **Railway** (both services), verify env
vars, and confirm the app works end-to-end.

## Stack
- Backend: FastAPI (Python 3.11), Motor (Mongo), bcrypt + PyJWT auth
- Frontend: React 19 (CRA + craco), Tailwind, shadcn-ui, phosphor icons
- Database: MongoDB
- LLM / 3rd-party: Hero MotoCorp eCatalogue REST API (external, via `HERO_ECATALOGUE_URL`)

## Environment variables

### Backend (/app/backend/.env)
| Key | Value / notes |
| --- | --- |
| `MONGO_URL` | Local Mongo (preview). Set to Atlas / Railway Mongo string in prod. |
| `DB_NAME` | `test_database` in preview. Use `hmcl_prod` in prod. |
| `CORS_ORIGINS` | `*` in preview. Set to frontend origin in prod. |
| `JWT_SECRET` | 48-byte URL-safe random string. |
| `HERO_ECATALOGUE_URL` | `https://ecatalogue.heromotocorp.com/eCatalogueRestAPI/` (used by `/api/hero/search`). Update if Hero API path changes. |
| `ADMIN_USERNAME` | `admin` (seeded on startup) |
| `ADMIN_PASSWORD` | `admin123` (change in prod) |

### Frontend (/app/frontend/.env)
| Key | Value |
| --- | --- |
| `REACT_APP_BACKEND_URL` | Preview URL (already set). Point to Railway backend URL for Railway deploy. |

## What has been done (2026-02-14)
- Cloned upstream repo into `/app` (sync excludes `.git`, `.emergent`, `.env`).
- Populated `/app/backend/.env` with all required env vars (JWT_SECRET generated, HERO URL defaulted, admin credentials seeded).
- Trimmed `requirements.txt` to the packages actually imported by `server.py`
  (removed `emergentintegrations` and `litellm` which had unresolvable
  dependency conflicts and are not used in this codebase).
- Installed frontend deps + `@phosphor-icons/react` (missing from `package.json`).
- Verified admin login works: `POST /api/auth/login` → 200 with JWT.
- Verified home page loads and renders the branded login screen.
- Ran `deployment_agent` — status **WARN** (only pre-existing N+1 query patterns; no deployment blockers).
- Created `/app/RAILWAY_DEPLOY.md` with step-by-step Railway instructions.

## User personas
- Dealer admin: logs in, manages inventory, creates orders, exports Excel/PDF.
- Parts operator: searches parts via Hero eCatalogue, adds to orders.

## Backlog (not blocking deploy)
- P2: Fix N+1 queries in `list_important_parts` and dashboard stats (use `$lookup` or `$in` batch fetch).
- P2: Replace default admin password on first launch (force change on first login).
- P2: Tighten `CORS_ORIGINS` from `*` to explicit frontend origin.
- P2: Add Dockerfile + railway.json for cleaner Railway deploys.

## Next tasks
1. User clicks **Deploy** in Emergent UI.
2. User follows `/app/RAILWAY_DEPLOY.md` to deploy on Railway.
3. Confirm `HERO_ECATALOGUE_URL` value is correct (if `/api/hero/search` fails, update it).
