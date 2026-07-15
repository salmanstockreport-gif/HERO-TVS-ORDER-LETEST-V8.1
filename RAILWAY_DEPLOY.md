# Railway Deployment Guide — HMCL Order System V2

This project can be deployed to Railway as **two services**: a FastAPI backend
and a React frontend. MongoDB can be added via Railway's Mongo plugin **or** a
free MongoDB Atlas cluster.

---

## Prerequisites

1. A Railway account: https://railway.app
2. Push this repo to GitHub (already done — https://github.com/salmanstockreport-gif/HMCL-ORDER-SYSTEM-V2)
3. Decide MongoDB source:
   - **Option A**: Railway Mongo plugin (one-click, in the same project)
   - **Option B**: MongoDB Atlas free tier (https://www.mongodb.com/atlas)

---

## Step 1 — Create Railway project

1. https://railway.app/new → **Deploy from GitHub repo** → select
   `salmanstockreport-gif/HMCL-ORDER-SYSTEM-V2`.
2. Railway will detect one service. Delete it — we'll add both services manually
   from the same repo.

---

## Step 2 — Add MongoDB

**Option A (Railway plugin):**
- In the project, click **+ New → Database → Add MongoDB**.
- Once provisioned, open the MongoDB service → **Variables** tab → copy the
  `MONGO_URL` value (Railway also exposes `MONGO_PUBLIC_URL`).

**Option B (Atlas):**
- Create a free M0 cluster on https://cloud.mongodb.com.
- Create a database user, whitelist `0.0.0.0/0`, and copy the connection
  string (looks like `mongodb+srv://<user>:<pass>@cluster.xxx.mongodb.net`).

---

## Step 3 — Backend service (FastAPI)

1. **+ New → GitHub Repo →** pick the HMCL repo.
2. In the service **Settings**:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
3. **Variables** tab — add:

   ```
   MONGO_URL=<from Step 2>
   DB_NAME=hmcl_prod
   JWT_SECRET=<generate a long random string, e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`>
   HERO_ECATALOGUE_URL=https://ecatalogue.heromotocorp.biz:8080/HeroeCat/
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<strong password>
   CORS_ORIGINS=<frontend Railway URL, comma-separated if multiple>
   ```

4. Click **Deploy**. Once live, note the backend public URL
   (e.g. `https://hmcl-backend-production.up.railway.app`).
5. Smoke test: `curl https://<backend-url>/api/` → `{"service":"Hero Parts Ordering","status":"ok"}`.

---

## Step 4 — Frontend service (React)

We'll serve the CRA build with a tiny Node static server (`serve`).

1. **+ New → GitHub Repo →** pick the same HMCL repo again.
2. In the service **Settings**:
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn install && yarn build`
   - **Start Command**: `npx serve -s build -l $PORT`
3. **Variables** tab — add **exactly** this key (must be set at build time):

   ```
   REACT_APP_BACKEND_URL=<backend Railway URL from Step 3, no trailing slash>
   ```

4. Click **Deploy**. Copy the frontend public URL.
5. Go back to the backend service Variables and update
   `CORS_ORIGINS=<frontend URL>` → redeploy backend.

---

## Step 5 — Smoke test both services

1. Open the frontend URL.
2. Log in with the admin credentials you set in Step 3.
3. Check Dashboard, Orders, Inventory, Settings load without errors.
4. If `/api/hero/search` fails, confirm `HERO_ECATALOGUE_URL` is correct.

---

## Notes / gotchas

- CRA env vars must be set **before build** — changing `REACT_APP_BACKEND_URL`
  requires a redeploy of the frontend service.
- The backend seeds an admin user on first startup using `ADMIN_USERNAME` /
  `ADMIN_PASSWORD`. To change credentials later, update the env vars and
  either delete the user from Mongo or update it via the Settings page.
- `CORS_ORIGINS=*` works but is not recommended for production; use the exact
  frontend URL(s).
- Railway auto-injects `$PORT` — do not hardcode a port in the start command.
