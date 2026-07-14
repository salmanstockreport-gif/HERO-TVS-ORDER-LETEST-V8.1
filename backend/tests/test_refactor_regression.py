"""
Regression tests for behavior-preserving refactor of server.py helpers
(_ensure_current_orders_limit, _resolve_new_order_items, _parse_backup_payload,
etc.). Verifies:
  - MAX_CURRENT_ORDERS = 2 (409 on 3rd)
  - order_no format HMC-YYYYMMDD-NNN
  - auto-inject mandatory parts when toggle on and empty items
  - dedupe duplicate part_no on create (normalized)
  - global_discount snapshot on order
  - excel/pdf export bytes
  - inventory upload + freshness marker
  - /api/db/import invalid & valid backup shapes
"""
import io
import json
import os
import re
import pytest
import requests
import pandas as pd


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_inventory_xlsx():
    df = pd.DataFrame([
        {"Part No": "23121-KST-901", "Description": "GEAR", "Stock Qty": 12},
        {"Part No": "PISTON-1", "Description": "PISTON", "Stock Qty": 3},
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    return buf.read()


def _ensure_fresh_inventory(headers):
    content = _make_inventory_xlsx()
    files = {"file": ("inv.xlsx", content,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"part_no": "Part No", "description": "Description",
            "stock_qty": "Stock Qty", "replace": "true"}
    r = requests.post(f"{API}/inventory/upload", headers=headers, files=files, data=data, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_all_current(headers):
    r = requests.get(f"{API}/orders", headers=headers,
                     params={"status": "current"}, timeout=30)
    if r.status_code == 200:
        for o in r.json():
            requests.delete(f"{API}/orders/{o['id']}", headers=headers,
                            params={"confirm": "delete"}, timeout=10)


@pytest.fixture(scope="module", autouse=True)
def prep(headers):
    _ensure_fresh_inventory(headers)
    _delete_all_current(headers)
    yield
    _delete_all_current(headers)
    _ensure_fresh_inventory(headers)


# ---------- basic regressions ----------
def test_health():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "ok"


def test_login_returns_jwt():
    r = requests.post(f"{API}/auth/login",
                      json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json().get("access_token"), str)


def test_hero_search_35010(headers):
    r = requests.get(f"{API}/hero/search", params={"q": "35010"}, headers=headers, timeout=60)
    if r.status_code == 502:
        pytest.skip("Hero site unreachable")
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("parts"), list)
    assert d.get("count", 0) > 0
    assert len(d["parts"]) > 0


# ---------- create_order regressions ----------
def test_order_no_format_and_global_discount(headers):
    _delete_all_current(headers)
    # set discount to a known value
    requests.put(f"{API}/settings/discount", headers=headers,
                 json={"discount_percent": 25}, timeout=30)
    r = requests.post(f"{API}/orders", headers=headers,
                      json={"items": [], "remarks": "TEST_refactor_orderno"}, timeout=30)
    assert r.status_code == 200, r.text
    o = r.json()
    assert re.match(r"^HMC-\d{8}-\d{3}$", o["order_no"]), o["order_no"]
    assert o["global_discount_snapshot"] == 25.0
    requests.delete(f"{API}/orders/{o['id']}", headers=headers,
                    params={"confirm": "delete"}, timeout=10)


def test_max_current_orders_limit(headers):
    _delete_all_current(headers)
    r1 = requests.post(f"{API}/orders", headers=headers,
                       json={"items": [], "remarks": "TEST_limit1"}, timeout=30)
    r2 = requests.post(f"{API}/orders", headers=headers,
                       json={"items": [], "remarks": "TEST_limit2"}, timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200
    r3 = requests.post(f"{API}/orders", headers=headers,
                       json={"items": [], "remarks": "TEST_limit3"}, timeout=30)
    assert r3.status_code == 409, r3.text
    det = r3.json().get("detail", {})
    assert det.get("code") == "current_orders_limit"
    assert det.get("limit") == 2
    # cleanup
    _delete_all_current(headers)


def test_dedupe_on_create(headers):
    _delete_all_current(headers)
    # ensure mandatory toggle off so items are used as-is
    requests.put(f"{API}/mandatory-toggle", headers=headers,
                 json={"enabled": False}, timeout=10)
    items = [
        {"part_no": "DUP-1", "description": "a", "mrp": 100, "qty": 1},
        {"part_no": "DUP1", "description": "b", "mrp": 200, "qty": 3},  # normalized dup
        {"part_no": "OTHER-9", "description": "c", "mrp": 50, "qty": 2},
    ]
    r = requests.post(f"{API}/orders", headers=headers,
                      json={"items": items, "remarks": "TEST_dedupe"}, timeout=30)
    assert r.status_code == 200, r.text
    order = r.json()
    # duplicate should be dropped silently -> 2 unique
    assert len(order["items"]) == 2
    requests.delete(f"{API}/orders/{order['id']}", headers=headers,
                    params={"confirm": "delete"}, timeout=10)


def test_auto_inject_mandatory_when_empty(headers):
    _delete_all_current(headers)
    # cleanup any TEST_ mandatory parts and enable toggle
    lst = requests.get(f"{API}/mandatory-parts", headers=headers, timeout=30).json().get("parts", [])
    for p in lst:
        if (p.get("description") or "").startswith("TEST_"):
            requests.delete(f"{API}/mandatory-parts/{p['id']}", headers=headers, timeout=10)

    mp = {"part_no": "MAND-RF", "description": "TEST_refactor_mand",
          "mrp": 400.0, "qty": 3}
    rc = requests.post(f"{API}/mandatory-parts", headers=headers, json=mp, timeout=30)
    assert rc.status_code == 200
    mid = rc.json()["id"]
    try:
        requests.put(f"{API}/mandatory-toggle", headers=headers,
                     json={"enabled": True}, timeout=10)
        requests.put(f"{API}/settings/discount", headers=headers,
                     json={"discount_percent": 25}, timeout=10)

        r = requests.post(f"{API}/orders", headers=headers,
                          json={"items": [], "remarks": "TEST_refactor_autoinj"}, timeout=30)
        assert r.status_code == 200, r.text
        order = r.json()
        assert len(order["items"]) == 1
        it = order["items"][0]
        assert it["mrp"] == 400.0
        assert it["qty"] == 3
        # global discount 25% -> 300
        assert abs(it["landed_price"] - 300.0) < 0.01
        assert abs(it["line_total"] - 900.0) < 0.01

        requests.delete(f"{API}/orders/{order['id']}", headers=headers,
                        params={"confirm": "delete"}, timeout=10)
    finally:
        requests.put(f"{API}/mandatory-toggle", headers=headers,
                     json={"enabled": False}, timeout=10)
        requests.delete(f"{API}/mandatory-parts/{mid}", headers=headers, timeout=10)


# ---------- update / delete regressions (helper-refactor safety) ----------
def test_put_empty_items_rejected(headers):
    _delete_all_current(headers)
    body = {"items": [{"part_no": "KEEP-1", "description": "d",
                       "mrp": 10, "qty": 1}],
            "remarks": "TEST_put_empty"}
    c = requests.post(f"{API}/orders", headers=headers, json=body, timeout=30)
    assert c.status_code == 200
    oid = c.json()["id"]
    try:
        r = requests.put(f"{API}/orders/{oid}", headers=headers,
                         json={"items": [], "remarks": "x"}, timeout=30)
        assert r.status_code == 400
        assert "Cannot save an empty order" in str(r.json().get("detail", ""))
        # original items still present
        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30).json()
        assert len(rg["items"]) == 1
    finally:
        requests.delete(f"{API}/orders/{oid}", headers=headers,
                        params={"confirm": "delete"}, timeout=10)


def test_delete_requires_confirm(headers):
    _delete_all_current(headers)
    c = requests.post(f"{API}/orders", headers=headers,
                      json={"items": [{"part_no": "X", "description": "d",
                                       "mrp": 1, "qty": 1}],
                            "remarks": "TEST_del_conf"}, timeout=30)
    oid = c.json()["id"]
    r_bad = requests.delete(f"{API}/orders/{oid}", headers=headers, timeout=30)
    assert r_bad.status_code == 400
    r_ok = requests.delete(f"{API}/orders/{oid}", headers=headers,
                           params={"confirm": "DELETE"}, timeout=30)  # case-insensitive
    assert r_ok.status_code == 200


# ---------- exports ----------
def test_export_excel_and_pdf(headers):
    _delete_all_current(headers)
    c = requests.post(f"{API}/orders", headers=headers,
                      json={"items": [{"part_no": "EX-1", "description": "item",
                                       "mrp": 500, "qty": 2}],
                            "remarks": "TEST_export"}, timeout=30)
    oid = c.json()["id"]
    try:
        rx = requests.get(f"{API}/orders/{oid}/export/excel", headers=headers, timeout=60)
        assert rx.status_code == 200
        assert rx.content[:2] == b"PK"
        assert len(rx.content) > 1024

        rp = requests.get(f"{API}/orders/{oid}/export/pdf", headers=headers, timeout=60)
        assert rp.status_code == 200
        assert rp.content[:5] == b"%PDF-"
        assert len(rp.content) > 1024
    finally:
        requests.delete(f"{API}/orders/{oid}", headers=headers,
                        params={"confirm": "delete"}, timeout=10)


# ---------- inventory upload freshness marker ----------
def test_inventory_upload_sets_freshness(headers):
    # csv (small)
    csv = "Part No,Stock Qty\nAB-1,5\nAB-2,10\n"
    files = {"file": ("inv.csv", csv.encode(), "text/csv")}
    data = {"part_no": "Part No", "stock_qty": "Stock Qty", "replace": "true"}
    r = requests.post(f"{API}/inventory/upload", headers=headers,
                      files=files, data=data, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("imported", 0) > 0

    s = requests.get(f"{API}/inventory/status", headers=headers, timeout=30).json()
    assert s.get("fresh") is True
    assert s.get("last_uploaded_at") is not None


# ---------- /api/db/import ----------
def test_db_import_rejects_invalid_backup(headers):
    bad = b'{"foo": "bar"}'
    files = {"file": ("bad.json", bad, "application/json")}
    r = requests.post(f"{API}/db/import", headers=headers, files=files, timeout=30)
    assert r.status_code == 400, r.text


def test_db_import_rejects_non_json(headers):
    files = {"file": ("bad.json", b"not-json-at-all", "application/json")}
    r = requests.post(f"{API}/db/import", headers=headers, files=files, timeout=30)
    assert r.status_code == 400


def test_db_import_accepts_valid_shape(headers):
    # Empty collections dict -> nothing overwritten, still accepted
    payload = {
        "app": "hero-parts-ordering",
        "exported_at": "2026-01-01T00:00:00Z",
        "collections": {}
    }
    files = {"file": ("good.json",
                       json.dumps(payload).encode(), "application/json")}
    r = requests.post(f"{API}/db/import", headers=headers, files=files, timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b.get("success") is True
    assert isinstance(b.get("imported"), dict)
