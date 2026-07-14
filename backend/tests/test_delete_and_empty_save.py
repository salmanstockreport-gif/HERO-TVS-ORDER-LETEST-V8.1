"""
Backend tests for:
1. DELETE /api/orders/{id} requires ?confirm=delete (case-insensitive)
2. PUT /api/orders/{id} rejects empty items array
3. Regression: /api/hero/search still works for '35010'
"""
import os
import pytest
import requests


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"


def _login():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers():
    return {"Authorization": f"Bearer {_login()}"}


def _cleanup_current_orders(headers):
    """Delete all current (draft) orders to make room for new tests."""
    r = requests.get(f"{API}/orders", headers=headers, params={"status": "current"}, timeout=30)
    if r.status_code != 200:
        # try without status filter
        r = requests.get(f"{API}/orders", headers=headers, timeout=30)
    if r.status_code == 200:
        data = r.json()
        orders = data if isinstance(data, list) else data.get("orders", [])
        for o in orders:
            status = (o.get("status") or "").lower()
            if status in ("current", "draft", ""):
                requests.delete(f"{API}/orders/{o['id']}", headers=headers,
                                params={"confirm": "delete"}, timeout=10)


def _valid_item():
    return {
        "part_no": "TEST-PART-1",
        "description": "TEST item",
        "mrp": 100.0,
        "qty": 1,
        "landed_price": 75.0,
        "line_total": 75.0,
    }


@pytest.fixture(scope="module", autouse=True)
def prep(headers):
    _cleanup_current_orders(headers)
    yield
    _cleanup_current_orders(headers)


def _create_order(headers, items=None):
    body = {"items": items if items is not None else [_valid_item()], "remarks": "TEST_delete_confirm"}
    r = requests.post(f"{API}/orders", headers=headers, json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ============================================================
# DELETE confirm
# ============================================================
class TestDeleteConfirm:
    def test_delete_without_confirm_returns_400(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers)
        oid = order["id"]

        r = requests.delete(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert r.status_code == 400, r.text
        assert "Delete not confirmed" in str(r.json().get("detail", ""))

        # order should still exist
        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert rg.status_code == 200

        # cleanup
        requests.delete(f"{API}/orders/{oid}", headers=headers, params={"confirm": "delete"}, timeout=10)

    def test_delete_wrong_confirm_string(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers)
        oid = order["id"]

        r = requests.delete(f"{API}/orders/{oid}", headers=headers,
                            params={"confirm": "DELETE_ME"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "Delete not confirmed" in str(r.json().get("detail", ""))

        # cleanup
        requests.delete(f"{API}/orders/{oid}", headers=headers, params={"confirm": "delete"}, timeout=10)

    def test_delete_correct_confirm_lowercase(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers)
        oid = order["id"]

        r = requests.delete(f"{API}/orders/{oid}", headers=headers,
                            params={"confirm": "delete"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True

        # subsequent GET -> 404
        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert rg.status_code == 404

    def test_delete_confirm_case_insensitive(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers)
        oid = order["id"]

        r = requests.delete(f"{API}/orders/{oid}", headers=headers,
                            params={"confirm": "DELETE"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert rg.status_code == 404


# ============================================================
# PUT empty items
# ============================================================
class TestPutEmptyItems:
    def test_put_empty_items_returns_400(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers, items=[_valid_item()])
        oid = order["id"]

        r = requests.put(f"{API}/orders/{oid}", headers=headers,
                         json={"items": [], "remarks": "empty"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "Cannot save an empty order" in str(r.json().get("detail", ""))

        # order in DB should still have the original item
        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert rg.status_code == 200
        assert len(rg.json()["items"]) >= 1

        # cleanup
        requests.delete(f"{API}/orders/{oid}", headers=headers, params={"confirm": "delete"}, timeout=10)

    def test_put_valid_items_succeeds(self, headers):
        _cleanup_current_orders(headers)
        order = _create_order(headers, items=[_valid_item()])
        oid = order["id"]

        new_item = {
            "part_no": "TEST-PART-2",
            "description": "TEST second",
            "mrp": 200.0,
            "qty": 2,
            "landed_price": 150.0,
            "line_total": 300.0,
        }
        r = requests.put(f"{API}/orders/{oid}", headers=headers,
                         json={"items": [new_item], "remarks": "updated"}, timeout=30)
        assert r.status_code == 200, r.text

        rg = requests.get(f"{API}/orders/{oid}", headers=headers, timeout=30)
        assert rg.status_code == 200
        data = rg.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["part_no"].replace("-", "").upper().startswith("TESTPART2") or \
               "TESTPART" in data["items"][0]["part_no"].replace("-", "").upper()

        # cleanup
        requests.delete(f"{API}/orders/{oid}", headers=headers, params={"confirm": "delete"}, timeout=10)


# ============================================================
# Regression: hero search
# ============================================================
class TestHeroSearchRegression:
    def test_hero_search_35010(self, headers):
        r = requests.get(f"{API}/hero/search", params={"q": "35010"}, headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # should return a list of results
        if isinstance(data, list):
            results = data
        else:
            results = data.get("parts") or data.get("results") or []
        assert len(results) > 0, f"Expected at least one result for '35010', got {data}"
