"""
Backend tests for the 3 NEW features:
1. Inventory 24h lock (freshness) with 423 gated endpoints
2. Important Parts CRUD + dashboard low_stock_alerts + enrichment
3. Mandatory Parts CRUD + toggle + auto-inject on empty order creation

Uses REACT_APP_BACKEND_URL for public endpoint testing.
"""
import io
import os
import time
import uuid
import pytest
import requests
import pandas as pd
from pymongo import MongoClient


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hmcl_db")


# ------------------------ Shared helpers ------------------------
def _login():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _make_inventory_xlsx(rows=None) -> bytes:
    if rows is None:
        rows = [
            {"Part No": "23121-KST-901", "Description": "GEAR PRIMARY DRIVE", "Stock Qty": 12},
            {"Part No": "PISTON-1", "Description": "PISTON KIT", "Stock Qty": 3},
            {"Part No": "BOLT-9", "Description": "Bolt", "Stock Qty": 0},
        ]
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    return buf.read()


def _upload_inventory(headers, rows=None):
    content = _make_inventory_xlsx(rows)
    files = {"file": ("inv.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"part_no": "Part No", "description": "Description", "stock_qty": "Stock Qty", "replace": "true"}
    r = requests.post(f"{API}/inventory/upload", headers=headers, files=files, data=data, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------ Fixtures ------------------------
@pytest.fixture(scope="module")
def token():
    return _login()


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module", autouse=True)
def ensure_fresh_inventory_at_end(headers):
    """After all tests, always ensure inventory is fresh so other suites/UI work."""
    yield
    try:
        _upload_inventory(headers)
    except Exception:
        pass


# ============================================================
# 1. Inventory Lock (24h freshness)
# ============================================================
class TestInventoryLock:
    def test_status_shape_when_fresh(self, headers):
        """Ensure inventory is fresh then check status shape."""
        _upload_inventory(headers)
        r = requests.get(f"{API}/inventory/status", headers=headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("fresh", "last_uploaded_at", "expires_at", "hours_remaining", "ttl_hours", "never_uploaded"):
            assert k in d, f"missing key: {k}"
        assert d["fresh"] is True
        assert d["never_uploaded"] is False
        assert d["ttl_hours"] == 24
        assert d["hours_remaining"] > 0

    def test_status_never_uploaded(self, headers, db):
        """Simulate never-uploaded and verify status."""
        db.settings.delete_one({"key": "inventory_status"})
        r = requests.get(f"{API}/inventory/status", headers=headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["fresh"] is False
        assert d["never_uploaded"] is True
        assert d["last_uploaded_at"] is None
        # restore
        _upload_inventory(headers)

    def test_locked_endpoints_return_423(self, headers, db):
        """POST /orders, PUT /orders/{id}, POST mark-sent, GET /hero/search must return 423."""
        # first create a valid draft order while fresh, then simulate lock
        _upload_inventory(headers)
        r = requests.post(f"{API}/orders", headers=headers, json={"items": [], "remarks": "TEST_lock"}, timeout=30)
        assert r.status_code == 200
        oid = r.json()["id"]

        # simulate stale
        db.settings.delete_one({"key": "inventory_status"})

        # 1. POST /orders -> 423
        r1 = requests.post(f"{API}/orders", headers=headers, json={"items": [], "remarks": "TEST_locked_create"}, timeout=30)
        assert r1.status_code == 423, r1.text
        det = r1.json()["detail"]
        assert det["code"] == "inventory_stale"
        assert det["fresh"] is False
        assert det["never_uploaded"] is True
        assert det["ttl_hours"] == 24
        assert "message" in det

        # 2. PUT /orders/{id} -> 423
        r2 = requests.put(f"{API}/orders/{oid}", headers=headers, json={"items": [], "remarks": "x"}, timeout=30)
        assert r2.status_code == 423
        assert r2.json()["detail"]["code"] == "inventory_stale"

        # 3. POST /orders/{id}/mark-sent -> 423
        r3 = requests.post(f"{API}/orders/{oid}/mark-sent", headers=headers, timeout=30)
        assert r3.status_code == 423

        # 4. GET /hero/search -> 423
        r4 = requests.get(f"{API}/hero/search", params={"q": "23121"}, headers=headers, timeout=30)
        assert r4.status_code == 423
        assert r4.json()["detail"]["code"] == "inventory_stale"

        # cleanup
        _upload_inventory(headers)
        requests.delete(f"{API}/orders/{oid}", headers=headers, timeout=10)

    def test_get_endpoints_not_blocked_when_stale(self, headers, db):
        """GET list/stats/important/mandatory must NOT be gated by fresh inventory."""
        db.settings.delete_one({"key": "inventory_status"})
        # None of these should be 423
        for url in [
            f"{API}/orders",
            f"{API}/dashboard/stats",
            f"{API}/important-parts",
            f"{API}/mandatory-parts",
            f"{API}/inventory/status",
        ]:
            r = requests.get(url, headers=headers, timeout=30)
            assert r.status_code == 200, f"{url} -> {r.status_code} {r.text}"
        _upload_inventory(headers)

    def test_upload_unlocks(self, headers, db):
        """Fresh upload should flip fresh back to true."""
        db.settings.delete_one({"key": "inventory_status"})
        s0 = requests.get(f"{API}/inventory/status", headers=headers, timeout=30).json()
        assert s0["fresh"] is False
        _upload_inventory(headers)
        s1 = requests.get(f"{API}/inventory/status", headers=headers, timeout=30).json()
        assert s1["fresh"] is True
        assert s1["never_uploaded"] is False
        assert s1["hours_remaining"] > 23


# ============================================================
# 2. Important Parts CRUD + low_stock_alerts
# ============================================================
class TestImportantParts:
    @classmethod
    def _cleanup(cls, headers):
        r = requests.get(f"{API}/important-parts", headers=headers, timeout=30)
        if r.status_code == 200:
            for p in r.json():
                if (p.get("description") or "").startswith("TEST_"):
                    requests.delete(f"{API}/important-parts/{p['id']}", headers=headers, timeout=10)

    def test_full_crud_and_enrichment(self, headers):
        _upload_inventory(headers)
        self._cleanup(headers)

        # CREATE
        body = {"part_no": "PISTON-1", "description": "TEST_PISTON KIT", "threshold_qty": 10}
        r = requests.post(f"{API}/important-parts", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert "id" in created
        assert created["threshold_qty"] == 10.0
        assert created["description"] == "TEST_PISTON KIT"
        pid = created["id"]

        # LIST enrichment - PISTON-1 has stock 3, threshold 10 -> is_low True
        r2 = requests.get(f"{API}/important-parts", headers=headers, timeout=30)
        assert r2.status_code == 200
        entry = [p for p in r2.json() if p["id"] == pid][0]
        assert entry["current_stock"] == 3.0
        assert entry["is_low"] is True

        # Duplicate -> 400
        rd = requests.post(f"{API}/important-parts", headers=headers, json=body, timeout=30)
        assert rd.status_code == 400

        # UPDATE threshold to 1 -> is_low False
        ru = requests.put(f"{API}/important-parts/{pid}", headers=headers,
                          json={"part_no": "PISTON-1", "description": "TEST_updated", "threshold_qty": 1}, timeout=30)
        assert ru.status_code == 200
        r3 = requests.get(f"{API}/important-parts", headers=headers, timeout=30)
        entry2 = [p for p in r3.json() if p["id"] == pid][0]
        assert entry2["threshold_qty"] == 1.0
        assert entry2["description"] == "TEST_updated"
        assert entry2["is_low"] is False  # stock 3 >= 1

        # DELETE
        rdel = requests.delete(f"{API}/important-parts/{pid}", headers=headers, timeout=30)
        assert rdel.status_code == 200
        r4 = requests.get(f"{API}/important-parts", headers=headers, timeout=30)
        assert not any(p["id"] == pid for p in r4.json())

    def test_dashboard_low_stock_alerts(self, headers):
        _upload_inventory(headers)
        self._cleanup(headers)

        # add an important part whose stock (3) is below threshold (10)
        body = {"part_no": "PISTON-1", "description": "TEST_lowstock", "threshold_qty": 10}
        r = requests.post(f"{API}/important-parts", headers=headers, json=body, timeout=30)
        assert r.status_code == 200
        pid = r.json()["id"]

        stats = requests.get(f"{API}/dashboard/stats", headers=headers, timeout=30).json()
        assert "low_stock_alerts" in stats
        assert "inventory_status" in stats
        assert stats["inventory_status"]["fresh"] is True
        alerts = stats["low_stock_alerts"]
        match = [a for a in alerts if a["id"] == pid]
        assert len(match) == 1
        alert = match[0]
        assert alert["current_stock"] == 3.0
        assert alert["threshold_qty"] == 10.0

        # cleanup
        requests.delete(f"{API}/important-parts/{pid}", headers=headers, timeout=10)


# ============================================================
# 3. Mandatory Parts CRUD + toggle + auto-inject
# ============================================================
class TestMandatoryParts:
    @classmethod
    def _cleanup(cls, headers):
        r = requests.get(f"{API}/mandatory-parts", headers=headers, timeout=30)
        if r.status_code == 200:
            for p in r.json().get("parts", []):
                if (p.get("description") or "").startswith("TEST_"):
                    requests.delete(f"{API}/mandatory-parts/{p['id']}", headers=headers, timeout=10)
        # ensure toggle off
        requests.put(f"{API}/mandatory-toggle", headers=headers, json={"enabled": False}, timeout=10)

    def test_list_shape(self, headers):
        r = requests.get(f"{API}/mandatory-parts", headers=headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "parts" in d and isinstance(d["parts"], list)
        assert "enabled" in d and isinstance(d["enabled"], bool)

    def test_toggle_endpoint_route(self, headers):
        # correct route
        r = requests.put(f"{API}/mandatory-toggle", headers=headers, json={"enabled": True}, timeout=30)
        assert r.status_code == 200
        assert r.json()["enabled"] is True

        r_state = requests.get(f"{API}/mandatory-parts", headers=headers, timeout=30)
        assert r_state.json()["enabled"] is True

        # disable
        r2 = requests.put(f"{API}/mandatory-toggle", headers=headers, json={"enabled": False}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["enabled"] is False

    def test_crud(self, headers):
        self._cleanup(headers)
        body = {"part_no": "MAND-1", "description": "TEST_mand", "mrp": 200.0, "qty": 2}
        r = requests.post(f"{API}/mandatory-parts", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        mid = r.json()["id"]

        # duplicate -> 400
        rd = requests.post(f"{API}/mandatory-parts", headers=headers, json=body, timeout=30)
        assert rd.status_code == 400

        # update
        ru = requests.put(f"{API}/mandatory-parts/{mid}", headers=headers,
                          json={"part_no": "MAND-1", "description": "TEST_updated", "mrp": 250.0, "qty": 5}, timeout=30)
        assert ru.status_code == 200

        r_list = requests.get(f"{API}/mandatory-parts", headers=headers, timeout=30).json()["parts"]
        entry = [p for p in r_list if p["id"] == mid][0]
        assert entry["mrp"] == 250.0
        assert entry["qty"] == 5
        assert entry["description"] == "TEST_updated"

        # delete
        rdel = requests.delete(f"{API}/mandatory-parts/{mid}", headers=headers, timeout=30)
        assert rdel.status_code == 200

    def test_auto_inject_when_toggle_on(self, headers):
        """POST /orders with empty items and toggle on should auto-inject mandatory parts."""
        _upload_inventory(headers)
        self._cleanup(headers)

        # add one mandatory part
        mp = {"part_no": "MAND-AUTO", "description": "TEST_auto", "mrp": 400.0, "qty": 3}
        rc = requests.post(f"{API}/mandatory-parts", headers=headers, json=mp, timeout=30)
        assert rc.status_code == 200
        mid = rc.json()["id"]

        # enable toggle
        rt = requests.put(f"{API}/mandatory-toggle", headers=headers, json={"enabled": True}, timeout=30)
        assert rt.status_code == 200

        try:
            # ensure global discount 25%
            requests.put(f"{API}/settings/discount", headers=headers, json={"discount_percent": 25}, timeout=30)

            # create empty order -> should have 1 item auto-injected
            r = requests.post(f"{API}/orders", headers=headers, json={"items": [], "remarks": "TEST_autoinject"}, timeout=30)
            assert r.status_code == 200, r.text
            order = r.json()
            assert len(order["items"]) == 1
            item = order["items"][0]
            # part_no normalized/formatted (uppercase, no dashes, ends with S)
            assert "MANDAUTO" in item["part_no"].replace("-", "").upper()
            assert item["mrp"] == 400.0
            assert item["qty"] == 3
            # global discount 25% -> landed_price = 400 * 0.75 = 300
            assert abs(item["landed_price"] - 300.0) < 0.01
            assert abs(item["line_total"] - 900.0) < 0.01

            # cleanup this order
            requests.delete(f"{API}/orders/{order['id']}", headers=headers, timeout=10)
        finally:
            # cleanup
            requests.put(f"{API}/mandatory-toggle", headers=headers, json={"enabled": False}, timeout=10)
            requests.delete(f"{API}/mandatory-parts/{mid}", headers=headers, timeout=10)

    def test_no_auto_inject_when_toggle_off(self, headers):
        _upload_inventory(headers)
        self._cleanup(headers)

        mp = {"part_no": "MAND-OFF", "description": "TEST_off", "mrp": 100.0, "qty": 1}
        rc = requests.post(f"{API}/mandatory-parts", headers=headers, json=mp, timeout=30)
        assert rc.status_code == 200
        mid = rc.json()["id"]
        # toggle should be off (cleanup did it)
        try:
            r = requests.post(f"{API}/orders", headers=headers, json={"items": [], "remarks": "TEST_noinject"}, timeout=30)
            assert r.status_code == 200
            order = r.json()
            assert order["items"] == [], f"Expected no items, got {order['items']}"
            requests.delete(f"{API}/orders/{order['id']}", headers=headers, timeout=10)
        finally:
            requests.delete(f"{API}/mandatory-parts/{mid}", headers=headers, timeout=10)
