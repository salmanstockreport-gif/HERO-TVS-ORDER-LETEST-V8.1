"""Tests for /api/hero/search endpoint after HERO_ECATALOGUE_URL fix."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback to reading frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert isinstance(data["access_token"], str) and len(data["access_token"]) > 10
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_root_service():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "Hero Parts Ordering"
    assert data.get("status") == "ok"


def test_login_returns_jwt():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_hero_search_requires_auth():
    r = requests.get(f"{API}/hero/search", params={"q": "35010"}, timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


@pytest.mark.parametrize("q", ["35010", "91201", "50201"])
def test_hero_search_returns_results(auth_headers, q):
    r = requests.get(f"{API}/hero/search", params={"q": q}, headers=auth_headers, timeout=45)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
    data = r.json()
    assert data.get("query") == q
    assert "parts" in data and isinstance(data["parts"], list)
    assert "count" in data
    assert data["count"] > 0, f"expected results for {q}, got 0. body={data}"
    assert len(data["parts"]) > 0
    first = data["parts"][0]
    # fields required
    for field in ("part_no", "description", "mrp"):
        assert field in first, f"missing field {field} in {first}"


def test_hero_search_unknown_part_graceful(auth_headers):
    r = requests.get(f"{API}/hero/search", params={"q": "ZZZZZ99999"}, headers=auth_headers, timeout=45)
    assert r.status_code == 200, f"expected 200 graceful, got {r.status_code} body={r.text[:400]}"
    data = r.json()
    assert data.get("count") == 0
    assert data.get("parts") == []
