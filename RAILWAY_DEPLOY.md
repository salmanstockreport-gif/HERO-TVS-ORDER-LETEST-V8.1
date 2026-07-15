# Railway Deployment Guide — Kabir Auto Parts (Hero + TVS Ordering)

This project deploys to Railway as **two services** (FastAPI backend + React
frontend) plus a MongoDB instance.

---

## Prerequisites

1. A Railway account: https://railway.app
2. This repo pushed to GitHub. From the Emergent chat use the **"Save to GitHub"**
   button (top of the chat input) to sync your latest code to
   https://github.com/salmanstockreport-gif/hmcl-order-v3.
3. Decide MongoDB source:
   - **Option A**: Railway Mongo plugin (one click, same project)
   - **Option B**: MongoDB Atlas free tier (https://www.mongodb.com/atlas)

---

## Step 1 — Create Railway project

1. https://railway.app/new → **Deploy from GitHub repo** → pick
   `salmanstockreport-gif/hmcl-order-v3`.
2. Railway will detect one service. **Delete** the auto-created service — we'll
   add backend and frontend manually from the same repo.

---

## Step 2 — Add MongoDB

**Option A (Railway plugin):**
- In the project, click **+ New → Database → Add MongoDB**.
- Open the MongoDB service → **Variables** tab → copy `MONGO_URL`.

**Option B (Atlas):**
- Create a free M0 cluster on https://cloud.mongodb.com.
- Create a database user, whitelist `0.0.0.0/0`, and copy the connection
  string (looks like `mongodb+srv://<user>:<pass>@cluster.xxx.mongodb.net`).

---

## Step 3 — Backend service (FastAPI)

1. **+ New → GitHub Repo →** pick the hmcl-order-v3 repo.
2. In the service **Settings**:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
3. **Variables** tab — add:

   ```
   MONGO_URL=<from Step 2>
   DB_NAME=hmcl_prod
   JWT_SECRET=<long random string, e.g. `python -c "import secrets;print(secrets.token_urlsafe(48))"`>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<strong password>
   CORS_ORIGINS=<frontend Railway URL, comma-separated if multiple>

   # Hero eCatalogue (current production URL — verified July 2025)
   HERO_ECATALOGUE_URL=https://ecatalogue.heromotocorp.biz:8080/HeroeCat/

   # TVS PartEcommerce API (advantagetvs.com)
   TVS_ECOMMERCE_API_URL=https://www.advantagetvs.com/PartEcommerceAPI/
   TVS_DEALER_ID=10001
   TVS_BRANCH_ID=1
   TVS_CUSTOMER_TYPE=Customer
   ```

4. Click **Deploy**. Once live, note the backend public URL
   (e.g. `https://kabir-backend-production.up.railway.app`).
5. Smoke test: `curl https://<backend-url>/api/` → `{"service":"Hero Parts Ordering","status":"ok"}`.

---

## Step 4 — Frontend service (React)

We serve the CRA build with a tiny Node static server (`serve`).

1. **+ New → GitHub Repo →** pick the same repo again.
2. In the service **Settings**:
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn install && yarn build`
   - **Start Command**: `npx serve -s build -l $PORT`
3. **Variables** tab — add (must be set **at build time** so CRA bakes it in):

   ```
   REACT_APP_BACKEND_URL=<backend Railway URL from Step 3, no trailing slash>
   ```

4. Click **Deploy**. Copy the frontend public URL.
5. Go back to the backend service Variables and set
   `CORS_ORIGINS=<frontend URL>` → redeploy backend.

---

## Step 5 — Smoke test both services

1. Open the frontend URL and log in with the admin credentials from Step 3.
2. You should land on the **system selector** — pick **Hero** and check the
   dashboard, then use the sidebar switcher to try **TVS**.
3. Test Hero search with part `23121KST901` — expect a real MRP result.
4. Test TVS search with part `N3012050` — expect "VALVE STEM OIL SEAL" MRP 80.
5. Under **Settings → Employees**, create an employee with limited access.
   Log out and back in as that employee to verify the permission gates.

---

## Notes / gotchas

- **CRA env vars must be set before build.** Changing `REACT_APP_BACKEND_URL`
  requires redeploying the frontend service.
- **First-startup migrations run automatically**: any pre-existing users are
  upgraded to `role=owner`, and existing orders / important-parts /
  mandatory-parts docs are backfilled with `system="hero"`.
- **Admin seeding**: on first startup the backend creates the admin user from
  `ADMIN_USERNAME` / `ADMIN_PASSWORD`. To change these later, update the env
  vars and either delete the user from Mongo or change the password via the
  Settings page.
- **CORS**: `CORS_ORIGINS=*` works but is not recommended for production; set
  the exact frontend URL(s).
- **Ports**: Railway auto-injects `$PORT` — do not hardcode.
- **TVS API stability**: The TVS endpoint (`advantagetvs.com/PartEcommerceAPI`)
  is reverse-engineered from their dealer web app. If it stops returning data,
  check `/PartEcommerceUI/partSearch` in a browser to see if TVS changed the
  API contract.
