"""
Backend tests for Hero MotoCorp Parts Ordering System
Covers: Auth, Settings, Hero search (live), Orders CRUD, Order state machine,
Exports (Excel/PDF), Inventory (mapping/preview/upload/lookup), Dashboard stats.
"""
import io
import os
import time
import pytest
import requests
import pandas as pd

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://instant-ship-7.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


# ---------------------------- Fixtures ----------------------------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session", autouse=True)
def cleanup_orders(auth_headers):
    """Clean up any test-created orders at end of session."""
    yield
    try:
        r = requests.get(f"{API}/orders", headers=auth_headers, timeout=30)
        if r.status_code == 200:
            for o in r.json():
                if (o.get("remarks") or "").startswith("TEST_"):
                    requests.delete(f"{API}/orders/{o['id']}", headers=auth_headers, timeout=10)
    except Exception:
        pass


# ---------------------------- Auth ----------------------------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_endpoint(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        user = r.json()
        assert user["username"] == "admin"
        assert "password_hash" not in user

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403)


# ---------------------------- Settings ----------------------------
class TestSettings:
    def test_get_settings_default(self, auth_headers):
        r = requests.get(f"{API}/settings", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "discount_percent" in data

    def test_update_and_persist_discount(self, auth_headers):
        r = requests.put(f"{API}/settings/discount", headers=auth_headers, json={"discount_percent": 20}, timeout=30)
        assert r.status_code == 200
        assert r.json()["discount_percent"] == 20

        # persistence
        r2 = requests.get(f"{API}/settings", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["discount_percent"] == 20

        # restore to 25
        requests.put(f"{API}/settings/discount", headers=auth_headers, json={"discount_percent": 25}, timeout=30)

    def test_update_discount_invalid(self, auth_headers):
        r = requests.put(f"{API}/settings/discount", headers=auth_headers, json={"discount_percent": 150}, timeout=30)
        assert r.status_code == 400


# ---------------------------- Hero live search ----------------------------
class TestHeroSearch:
    def test_hero_search_live(self, auth_headers):
        r = requests.get(f"{API}/hero/search", params={"q": "23121KST901S"}, headers=auth_headers, timeout=60)
        # 502 acceptable if Hero site unreachable
        if r.status_code == 502:
            pytest.skip(f"Hero eCatalogue unreachable: {r.text}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "parts" in data
        assert data["count"] >= 0
        # try find target part
        target = [p for p in data["parts"] if (p.get("part_no") or "").replace("-", "").upper() == "23121KST901"]
        if target:
            p = target[0]
            desc = (p.get("description") or "").upper()
            assert "GEAR" in desc or "PRIMARY" in desc, f"Unexpected desc: {desc}"
            assert p.get("mrp") is not None

    def test_hero_search_empty(self, auth_headers):
        r = requests.get(f"{API}/hero/search", params={"q": ""}, headers=auth_headers, timeout=30)
        assert r.status_code == 400


# ---------------------------- Orders ----------------------------
class TestOrders:
    def test_create_order_default(self, auth_headers):
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_empty"}, timeout=30)
        assert r.status_code == 200
        order = r.json()
        assert order["status"] == "current"
        assert order["order_no"].startswith("HMC-")
        parts = order["order_no"].split("-")
        assert len(parts) == 3 and len(parts[1]) == 8 and len(parts[2]) == 3
        assert order["items"] == []

    def test_order_no_sequence_increments(self, auth_headers):
        r1 = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_seq1"}, timeout=30)
        r2 = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_seq2"}, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        n1 = int(r1.json()["order_no"].split("-")[-1])
        n2 = int(r2.json()["order_no"].split("-")[-1])
        assert n2 == n1 + 1

    def test_update_order_landed_price(self, auth_headers):
        # ensure discount is 25
        requests.put(f"{API}/settings/discount", headers=auth_headers, json={"discount_percent": 25}, timeout=30)
        # create draft
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_landed"}, timeout=30)
        order_id = r.json()["id"]

        items = [{"part_no": "23121-KST-901", "description": "GEAR", "mrp": 279.13, "qty": 2}]
        r2 = requests.put(f"{API}/orders/{order_id}", headers=auth_headers, json={"items": items, "remarks": "TEST_landed"}, timeout=30)
        assert r2.status_code == 200, r2.text
        it = r2.json()["items"][0]
        # 25% off of 279.13 = 209.3475 → round 209.35
        assert abs(it["landed_price"] - round(279.13 * 0.75, 2)) < 0.01
        assert abs(it["line_total"] - it["landed_price"] * 2) < 0.01
        assert it["discount_percent"] == 25.0

    def test_update_order_duplicate_part(self, auth_headers):
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_dup"}, timeout=30)
        order_id = r.json()["id"]
        items = [
            {"part_no": "AB-123", "description": "X", "mrp": 100, "qty": 1},
            {"part_no": "AB123", "description": "X2", "mrp": 100, "qty": 1},  # normalized duplicate
        ]
        r2 = requests.put(f"{API}/orders/{order_id}", headers=auth_headers, json={"items": items, "remarks": "TEST_dup"}, timeout=30)
        assert r2.status_code == 400
        assert "Duplicate" in r2.json().get("detail", "")

    def test_check_part_previously_ordered(self, auth_headers):
        # create an order with the unique part
        unique_part = f"TESTPART{int(time.time())}"
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_checkpart"}, timeout=30)
        oid = r.json()["id"]
        items = [{"part_no": unique_part, "description": "d", "mrp": 10, "qty": 3}]
        r2 = requests.put(f"{API}/orders/{oid}", headers=auth_headers, json={"items": items, "remarks": "TEST_checkpart"}, timeout=30)
        assert r2.status_code == 200

        r3 = requests.get(f"{API}/orders/check-part/{unique_part}", headers=auth_headers, timeout=30)
        assert r3.status_code == 200
        data = r3.json()
        assert data["previously_ordered"] is True
        assert len(data["orders"]) >= 1
        assert data["orders"][0]["qty"] == 3

    def test_mark_sent_empty_rejected(self, auth_headers):
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_marksent_empty"}, timeout=30)
        oid = r.json()["id"]
        r2 = requests.post(f"{API}/orders/{oid}/mark-sent", headers=auth_headers, timeout=30)
        assert r2.status_code == 400

    def test_mark_sent_and_immutable_and_reopen(self, auth_headers):
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_send"}, timeout=30)
        oid = r.json()["id"]
        items = [{"part_no": "SENDPART1", "description": "d", "mrp": 100, "qty": 1}]
        requests.put(f"{API}/orders/{oid}", headers=auth_headers, json={"items": items, "remarks": "TEST_send"}, timeout=30)

        r2 = requests.post(f"{API}/orders/{oid}/mark-sent", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "sent"
        assert r2.json()["sent_at"] is not None

        # immutable
        r3 = requests.put(f"{API}/orders/{oid}", headers=auth_headers, json={"items": items, "remarks": "TEST_send"}, timeout=30)
        assert r3.status_code == 400

        # reopen
        r4 = requests.post(f"{API}/orders/{oid}/reopen", headers=auth_headers, timeout=30)
        assert r4.status_code == 200
        assert r4.json()["status"] == "current"
        assert r4.json()["sent_at"] is None

    def test_list_orders_by_status(self, auth_headers):
        r_cur = requests.get(f"{API}/orders", headers=auth_headers, params={"status": "current"}, timeout=30)
        r_sent = requests.get(f"{API}/orders", headers=auth_headers, params={"status": "sent"}, timeout=30)
        assert r_cur.status_code == 200 and r_sent.status_code == 200
        for o in r_cur.json():
            assert o["status"] == "current"
        for o in r_sent.json():
            assert o["status"] == "sent"


# ---------------------------- Exports ----------------------------
class TestExports:
    def _make_order_with_item(self, auth_headers):
        r = requests.post(f"{API}/orders", headers=auth_headers, json={"items": [], "remarks": "TEST_export"}, timeout=30)
        oid = r.json()["id"]
        items = [{"part_no": "EXP-1", "description": "Export item", "mrp": 500, "qty": 2}]
        requests.put(f"{API}/orders/{oid}", headers=auth_headers, json={"items": items, "remarks": "TEST_export"}, timeout=30)
        return oid

    def test_export_excel(self, auth_headers):
        oid = self._make_order_with_item(auth_headers)
        r = requests.get(f"{API}/orders/{oid}/export/excel", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        assert len(r.content) > 1000
        assert r.content[:2] == b"PK"  # xlsx zip signature

    def test_export_pdf(self, auth_headers):
        oid = self._make_order_with_item(auth_headers)
        r = requests.get(f"{API}/orders/{oid}/export/pdf", headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ---------------------------- Inventory ----------------------------
def _make_inventory_xlsx() -> bytes:
    df = pd.DataFrame([
        {"Part No": "23121-KST-901", "Description": "GEAR PRIMARY DRIVE", "Stock Qty": 12},
        {"Part No": "AB123", "Description": "Widget", "Stock Qty": 5},
        {"Part No": "XY-9", "Description": "Bolt", "Stock Qty": 0},
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    return buf.read()


class TestInventory:
    def test_mapping_roundtrip(self, auth_headers):
        payload = {"part_no": "Part No", "description": "Description", "stock_qty": "Stock Qty", "location": "", "rate": ""}
        r = requests.put(f"{API}/inventory/mapping", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/inventory/mapping", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        m = r2.json()
        assert m["part_no"] == "Part No"
        assert m["stock_qty"] == "Stock Qty"

    def test_preview(self, auth_headers):
        content = _make_inventory_xlsx()
        files = {"file": ("inv.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = requests.post(f"{API}/inventory/preview", headers=auth_headers, files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "Part No" in data["columns"]
        assert "Stock Qty" in data["columns"]
        assert data["row_count"] == 3
        assert len(data["sample"]) == 3

    def test_upload_list_and_lookup(self, auth_headers):
        content = _make_inventory_xlsx()
        files = {"file": ("inv.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"part_no": "Part No", "description": "Description", "stock_qty": "Stock Qty", "replace": "true"}
        r = requests.post(f"{API}/inventory/upload", headers=auth_headers, files=files, data=data, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 3

        # list
        r2 = requests.get(f"{API}/inventory", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) >= 3

        # lookup with hyphen normalization + case
        r3 = requests.get(f"{API}/inventory/lookup/23121kst901", headers=auth_headers, timeout=30)
        assert r3.status_code == 200
        d = r3.json()
        assert d["found"] is True
        assert d["stock_qty"] == 12

        # lookup missing
        r4 = requests.get(f"{API}/inventory/lookup/NOPART999", headers=auth_headers, timeout=30)
        assert r4.status_code == 200
        assert r4.json()["found"] is False

    def test_upload_bad_mapping(self, auth_headers):
        content = _make_inventory_xlsx()
        files = {"file": ("inv.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"part_no": "MISSING_COL", "stock_qty": "Stock Qty"}
        r = requests.post(f"{API}/inventory/upload", headers=auth_headers, files=files, data=data, timeout=30)
        assert r.status_code == 400


# ---------------------------- Dashboard ----------------------------
class TestDashboard:
    def test_dashboard_stats(self, auth_headers):
        r = requests.get(f"{API}/dashboard/stats", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("current_orders", "sent_orders", "inventory_items", "total_sent_value"):
            assert k in d
        assert isinstance(d["current_orders"], int)
        assert isinstance(d["sent_orders"], int)
        assert isinstance(d["inventory_items"], int)
        assert d["inventory_items"] >= 3
