#!/usr/bin/env python3
"""
Backend API Testing for Hero/TVS Parts Ordering App
Tests new features: per-system DLP, add-items endpoint, mandatory parts threshold
"""

import requests
import json
import io
from datetime import datetime

# Backend URL from frontend/.env
BASE_URL = "https://90281e1c-2500-4a02-801f-b32afda84490.preview.emergentagent.com/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Global token storage
token = None

def log(msg):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def login():
    """Login as admin and get access token"""
    global token
    log("TEST 1: Login as admin")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert "access_token" in data, "No access_token in response"
    token = data["access_token"]
    log(f"✅ Login successful, token obtained")
    return data

def headers():
    """Return auth headers"""
    return {"Authorization": f"Bearer {token}"}

def upload_inventory():
    """Upload a small inventory file to pass the 24h freshness gate"""
    log("TEST 2: Upload inventory (for 24h freshness gate)")
    
    # Create a minimal CSV inventory
    csv_content = """Part No,Description,Stock Qty
TESTPART1,Test Part 1,100
TESTPART2,Test Part 2,50
MANDLOW1,Mandatory Low Stock Part,1
MANDOK1,Mandatory OK Stock Part,500
23121KST901,Hero Test Part,200
N3012050,TVS Test Part,150
"""
    
    files = {
        'file': ('inventory.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')
    }
    
    # Form data with column mappings
    data = {
        'part_no': 'Part No',
        'description': 'Description',
        'stock_qty': 'Stock Qty',
        'location': '',
        'rate': '',
        'replace': 'true'
    }
    
    resp = requests.post(f"{BASE_URL}/inventory/upload", 
                        headers=headers(), 
                        files=files,
                        data=data)
    
    assert resp.status_code == 200, f"Inventory upload failed: {resp.status_code} {resp.text}"
    result = resp.json()
    log(f"✅ Inventory uploaded: {result.get('imported', 0)} items imported")
    return result

def test_per_system_dlp():
    """Test 1: Per-system DLP / discount (Hero vs TVS separate)"""
    log("\n=== TEST 3: Per-system DLP / Discount ===")
    
    # Set Hero DLP to 25%
    log("3.1: Set Hero DLP to 25%")
    resp = requests.put(f"{BASE_URL}/settings/discount?system=hero",
                       headers=headers(),
                       json={"discount_percent": 25})
    assert resp.status_code == 200, f"Failed to set Hero DLP: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["discount_percent"] == 25, f"Expected 25, got {data['discount_percent']}"
    assert data["system"] == "hero", f"Expected system=hero, got {data['system']}"
    log(f"✅ Hero DLP set to 25%")
    
    # Set TVS DLP to 10%
    log("3.2: Set TVS DLP to 10%")
    resp = requests.put(f"{BASE_URL}/settings/discount?system=tvs",
                       headers=headers(),
                       json={"discount_percent": 10})
    assert resp.status_code == 200, f"Failed to set TVS DLP: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["discount_percent"] == 10, f"Expected 10, got {data['discount_percent']}"
    assert data["system"] == "tvs", f"Expected system=tvs, got {data['system']}"
    log(f"✅ TVS DLP set to 10%")
    
    # Get Hero settings
    log("3.3: GET /api/settings?system=hero")
    resp = requests.get(f"{BASE_URL}/settings?system=hero", headers=headers())
    assert resp.status_code == 200, f"Failed to get Hero settings: {resp.status_code} {resp.text}"
    data = resp.json()
    log(f"   Hero settings: discount_percent={data.get('discount_percent')}, "
        f"discount_percent_hero={data.get('discount_percent_hero')}, "
        f"discount_percent_tvs={data.get('discount_percent_tvs')}")
    
    assert data["discount_percent"] == 25, f"Expected discount_percent=25 for Hero, got {data['discount_percent']}"
    assert data["discount_percent_hero"] == 25, f"Expected discount_percent_hero=25, got {data['discount_percent_hero']}"
    assert data["discount_percent_tvs"] == 10, f"Expected discount_percent_tvs=10, got {data['discount_percent_tvs']}"
    log(f"✅ Hero settings correct: discount_percent=25, discount_percent_hero=25, discount_percent_tvs=10")
    
    # Get TVS settings
    log("3.4: GET /api/settings?system=tvs")
    resp = requests.get(f"{BASE_URL}/settings?system=tvs", headers=headers())
    assert resp.status_code == 200, f"Failed to get TVS settings: {resp.status_code} {resp.text}"
    data = resp.json()
    log(f"   TVS settings: discount_percent={data.get('discount_percent')}, "
        f"discount_percent_hero={data.get('discount_percent_hero')}, "
        f"discount_percent_tvs={data.get('discount_percent_tvs')}")
    
    assert data["discount_percent"] == 10, f"Expected discount_percent=10 for TVS, got {data['discount_percent']}"
    assert data["discount_percent_hero"] == 25, f"Expected discount_percent_hero=25, got {data['discount_percent_hero']}"
    assert data["discount_percent_tvs"] == 10, f"Expected discount_percent_tvs=10, got {data['discount_percent_tvs']}"
    log(f"✅ TVS settings correct: discount_percent=10, discount_percent_hero=25, discount_percent_tvs=10")
    
    # Verify independence: change Hero again and check TVS unchanged
    log("3.5: Verify independence - change Hero to 30%, check TVS still 10%")
    resp = requests.put(f"{BASE_URL}/settings/discount?system=hero",
                       headers=headers(),
                       json={"discount_percent": 30})
    assert resp.status_code == 200, f"Failed to update Hero DLP: {resp.status_code} {resp.text}"
    
    resp = requests.get(f"{BASE_URL}/settings?system=tvs", headers=headers())
    assert resp.status_code == 200, f"Failed to get TVS settings: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["discount_percent"] == 10, f"TVS DLP changed unexpectedly to {data['discount_percent']}"
    assert data["discount_percent_hero"] == 30, f"Hero DLP not updated to 30, got {data['discount_percent_hero']}"
    log(f"✅ Systems are independent: Hero=30%, TVS=10%")
    
    # Reset Hero back to 25% for subsequent tests
    log("3.6: Reset Hero DLP back to 25%")
    resp = requests.put(f"{BASE_URL}/settings/discount?system=hero",
                       headers=headers(),
                       json={"discount_percent": 25})
    assert resp.status_code == 200, f"Failed to reset Hero DLP: {resp.status_code} {resp.text}"
    log(f"✅ Hero DLP reset to 25%")

def cleanup_existing_orders():
    """Clean up existing draft orders to avoid hitting the limit"""
    log("Cleanup: Checking for existing draft orders")
    
    # Get Hero orders
    resp = requests.get(f"{BASE_URL}/orders?system=hero", headers=headers())
    if resp.status_code == 200:
        orders = resp.json()
        hero_current = [o for o in orders if o.get("status") == "current"]
        log(f"   Found {len(hero_current)} current Hero orders")
        for order in hero_current:
            order_id = order["id"]
            # Add at least one item if empty
            if not order.get("items"):
                requests.put(f"{BASE_URL}/orders/{order_id}", 
                           headers=headers(),
                           json={"items": [{"part_no": "DUMMY", "description": "Dummy", "mrp": 1, "qty": 1}], "remarks": ""})
            # Mark as sent
            resp = requests.post(f"{BASE_URL}/orders/{order_id}/mark-sent", headers=headers())
            if resp.status_code == 200:
                log(f"   ✓ Marked Hero order {order_id} as sent")
            else:
                log(f"   ✗ Failed to mark Hero order {order_id} as sent: {resp.status_code}")
    
    # Get TVS orders
    resp = requests.get(f"{BASE_URL}/orders?system=tvs", headers=headers())
    if resp.status_code == 200:
        orders = resp.json()
        tvs_current = [o for o in orders if o.get("status") == "current"]
        log(f"   Found {len(tvs_current)} current TVS orders")
        for order in tvs_current:
            order_id = order["id"]
            # Add at least one item if empty
            if not order.get("items"):
                requests.put(f"{BASE_URL}/orders/{order_id}", 
                           headers=headers(),
                           json={"items": [{"part_no": "DUMMY", "description": "Dummy", "mrp": 1, "qty": 1}], "remarks": ""})
            # Mark as sent
            resp = requests.post(f"{BASE_URL}/orders/{order_id}/mark-sent", headers=headers())
            if resp.status_code == 200:
                log(f"   ✓ Marked TVS order {order_id} as sent")
            else:
                log(f"   ✗ Failed to mark TVS order {order_id} as sent: {resp.status_code}")

def test_order_uses_system_dlp():
    """Test 2: Order uses system DLP"""
    log("\n=== TEST 4: Order Uses System DLP ===")
    
    # Clean up existing orders first
    cleanup_existing_orders()
    
    # Create Hero order
    log("4.1: Create Hero order with item (MRP=100)")
    hero_order_data = {
        "items": [
            {
                "part_no": "HEROPART1",
                "description": "Hero Test Part",
                "mrp": 100.0,
                "qty": 2
            }
        ],
        "remarks": "Test Hero order"
    }
    resp = requests.post(f"{BASE_URL}/orders?system=hero",
                        headers=headers(),
                        json=hero_order_data)
    assert resp.status_code == 200, f"Failed to create Hero order: {resp.status_code} {resp.text}"
    hero_order = resp.json()
    hero_order_id = hero_order["id"]
    
    # Verify Hero order uses 25% discount
    hero_item = hero_order["items"][0]
    log(f"   Hero order item: discount_percent={hero_item.get('discount_percent')}, "
        f"landed_price={hero_item.get('landed_price')}, line_total={hero_item.get('line_total')}")
    
    assert hero_item["discount_percent"] == 25, f"Expected Hero discount=25%, got {hero_item['discount_percent']}"
    expected_landed = round(100 * (1 - 0.25), 2)  # 75.0
    assert hero_item["landed_price"] == expected_landed, f"Expected landed_price={expected_landed}, got {hero_item['landed_price']}"
    expected_line_total = round(expected_landed * 2, 2)  # 150.0
    assert hero_item["line_total"] == expected_line_total, f"Expected line_total={expected_line_total}, got {hero_item['line_total']}"
    log(f"✅ Hero order uses Hero DLP (25%): landed_price=75.0, line_total=150.0")
    
    # Create TVS order
    log("4.2: Create TVS order with item (MRP=100)")
    tvs_order_data = {
        "items": [
            {
                "part_no": "TVSPART1",
                "description": "TVS Test Part",
                "mrp": 100.0,
                "qty": 2
            }
        ],
        "remarks": "Test TVS order"
    }
    resp = requests.post(f"{BASE_URL}/orders?system=tvs",
                        headers=headers(),
                        json=tvs_order_data)
    assert resp.status_code == 200, f"Failed to create TVS order: {resp.status_code} {resp.text}"
    tvs_order = resp.json()
    tvs_order_id = tvs_order["id"]
    
    # Verify TVS order uses 10% discount
    tvs_item = tvs_order["items"][0]
    log(f"   TVS order item: discount_percent={tvs_item.get('discount_percent')}, "
        f"landed_price={tvs_item.get('landed_price')}, line_total={tvs_item.get('line_total')}")
    
    assert tvs_item["discount_percent"] == 10, f"Expected TVS discount=10%, got {tvs_item['discount_percent']}"
    expected_landed = round(100 * (1 - 0.10), 2)  # 90.0
    assert tvs_item["landed_price"] == expected_landed, f"Expected landed_price={expected_landed}, got {tvs_item['landed_price']}"
    expected_line_total = round(expected_landed * 2, 2)  # 180.0
    assert tvs_item["line_total"] == expected_line_total, f"Expected line_total={expected_line_total}, got {tvs_item['line_total']}"
    log(f"✅ TVS order uses TVS DLP (10%): landed_price=90.0, line_total=180.0")
    
    return hero_order_id, tvs_order_id

def test_add_items_endpoint(hero_order_id):
    """Test 3: Add-items endpoint"""
    log("\n=== TEST 5: Add-Items Endpoint ===")
    
    # Add items to Hero order
    log("5.1: Add item to Hero draft order")
    add_items_data = {
        "items": [
            {
                "part_no": "TESTPART1",
                "description": "Test Part 1",
                "mrp": 100.0,
                "qty": 2
            }
        ]
    }
    resp = requests.post(f"{BASE_URL}/orders/{hero_order_id}/add-items",
                        headers=headers(),
                        json=add_items_data)
    assert resp.status_code == 200, f"Failed to add items: {resp.status_code} {resp.text}"
    data = resp.json()
    
    log(f"   Response: added={data.get('added')}, total items={len(data.get('order', {}).get('items', []))}")
    assert data["added"] == 1, f"Expected added=1, got {data['added']}"
    
    # Verify the item was added with correct discount
    order = data["order"]
    added_item = None
    for item in order["items"]:
        if item["part_no"] == "TESTPART1":
            added_item = item
            break
    
    assert added_item is not None, "Added item not found in order"
    assert added_item["discount_percent"] == 25, f"Expected discount=25%, got {added_item['discount_percent']}"
    expected_landed = round(100 * (1 - 0.25), 2)  # 75.0
    assert added_item["landed_price"] == expected_landed, f"Expected landed_price={expected_landed}, got {added_item['landed_price']}"
    log(f"✅ Item added successfully with Hero DLP (25%): landed_price=75.0")
    
    # Try adding the same part again (should dedupe)
    log("5.2: Try adding same part again (dedupe test)")
    resp = requests.post(f"{BASE_URL}/orders/{hero_order_id}/add-items",
                        headers=headers(),
                        json=add_items_data)
    assert resp.status_code == 200, f"Failed to add items: {resp.status_code} {resp.text}"
    data = resp.json()
    
    log(f"   Response: added={data.get('added')}")
    assert data["added"] == 0, f"Expected added=0 (dedupe), got {data['added']}"
    log(f"✅ Dedupe working: added=0 for duplicate part")
    
    # Mark order as sent
    log("5.3: Mark order as sent")
    resp = requests.post(f"{BASE_URL}/orders/{hero_order_id}/mark-sent",
                        headers=headers())
    assert resp.status_code == 200, f"Failed to mark order sent: {resp.status_code} {resp.text}"
    log(f"✅ Order marked as sent")
    
    # Try adding items to sent order (should fail with 400)
    log("5.4: Try adding items to sent order (should fail)")
    add_items_data2 = {
        "items": [
            {
                "part_no": "TESTPART2",
                "description": "Test Part 2",
                "mrp": 50.0,
                "qty": 1
            }
        ]
    }
    resp = requests.post(f"{BASE_URL}/orders/{hero_order_id}/add-items",
                        headers=headers(),
                        json=add_items_data2)
    assert resp.status_code == 400, f"Expected 400 for sent order, got {resp.status_code}"
    log(f"✅ Correctly rejected add-items to sent order with 400")

def test_mandatory_parts_threshold():
    """Test 4: Mandatory parts threshold + low-stock flag"""
    log("\n=== TEST 6: Mandatory Parts Threshold + Low-Stock ===")
    
    # Clean up existing mandatory parts first
    log("6.0: Cleanup existing mandatory parts")
    resp = requests.get(f"{BASE_URL}/mandatory-parts?system=hero", headers=headers())
    if resp.status_code == 200:
        data = resp.json()
        for part in data.get("parts", []):
            if part.get("part_no") in ["MANDLOW1", "MANDLOW1S", "MANDOK1", "MANDOK1S"]:
                part_id = part.get("id")
                requests.delete(f"{BASE_URL}/mandatory-parts/{part_id}", headers=headers())
                log(f"   Deleted existing mandatory part: {part['part_no']}")
    
    # Create mandatory part with high threshold (should be low stock)
    log("6.1: Create mandatory part with threshold_qty=999, qty=1 (should be low)")
    mand_low_data = {
        "part_no": "MANDLOW1",
        "description": "Mandatory Low Stock Part",
        "mrp": 50.0,
        "qty": 1,
        "threshold_qty": 999
    }
    resp = requests.post(f"{BASE_URL}/mandatory-parts?system=hero",
                        headers=headers(),
                        json=mand_low_data)
    assert resp.status_code == 200, f"Failed to create mandatory part: {resp.status_code} {resp.text}"
    mand_low = resp.json()
    log(f"✅ Mandatory part created: {mand_low['part_no']}, threshold_qty={mand_low['threshold_qty']}")
    
    # Get mandatory parts and check is_low flag
    log("6.2: GET /api/mandatory-parts?system=hero - check is_low=true")
    resp = requests.get(f"{BASE_URL}/mandatory-parts?system=hero", headers=headers())
    assert resp.status_code == 200, f"Failed to get mandatory parts: {resp.status_code} {resp.text}"
    data = resp.json()
    
    parts = data.get("parts", [])
    mandlow_part = None
    for p in parts:
        # Hero parts get 'S' suffix, so check for both MANDLOW1 and MANDLOW1S
        if p.get("part_no") in ["MANDLOW1", "MANDLOW1S"]:
            mandlow_part = p
            break
    
    assert mandlow_part is not None, f"MANDLOW1/MANDLOW1S not found in mandatory parts. Found: {[p.get('part_no') for p in parts]}"
    log(f"   {mandlow_part['part_no']}: current_stock={mandlow_part.get('current_stock')}, "
        f"threshold_qty={mandlow_part.get('threshold_qty')}, is_low={mandlow_part.get('is_low')}")
    
    assert "current_stock" in mandlow_part, "current_stock not present"
    assert mandlow_part["current_stock"] == 1.0, f"Expected current_stock=1.0, got {mandlow_part['current_stock']}"
    assert mandlow_part["threshold_qty"] == 999.0, f"Expected threshold_qty=999, got {mandlow_part['threshold_qty']}"
    assert mandlow_part["is_low"] == True, f"Expected is_low=true (stock 1 < threshold 999), got {mandlow_part['is_low']}"
    log(f"✅ MANDLOW1 correctly flagged as low stock: is_low=true")
    
    # Create mandatory part with threshold_qty=0 (should not be low)
    log("6.3: Create mandatory part with threshold_qty=0 (should not be low)")
    mand_ok_data = {
        "part_no": "MANDOK1",
        "description": "Mandatory OK Stock Part",
        "mrp": 75.0,
        "qty": 1,
        "threshold_qty": 0
    }
    resp = requests.post(f"{BASE_URL}/mandatory-parts?system=hero",
                        headers=headers(),
                        json=mand_ok_data)
    assert resp.status_code == 200, f"Failed to create mandatory part: {resp.status_code} {resp.text}"
    mand_ok = resp.json()
    log(f"✅ Mandatory part created: {mand_ok['part_no']}, threshold_qty={mand_ok['threshold_qty']}")
    
    # Get mandatory parts and check is_low flag
    log("6.4: GET /api/mandatory-parts?system=hero - check is_low=false for threshold_qty=0")
    resp = requests.get(f"{BASE_URL}/mandatory-parts?system=hero", headers=headers())
    assert resp.status_code == 200, f"Failed to get mandatory parts: {resp.status_code} {resp.text}"
    data = resp.json()
    
    parts = data.get("parts", [])
    mandok_part = None
    for p in parts:
        # Hero parts get 'S' suffix, so check for both MANDOK1 and MANDOK1S
        if p.get("part_no") in ["MANDOK1", "MANDOK1S"]:
            mandok_part = p
            break
    
    assert mandok_part is not None, f"MANDOK1/MANDOK1S not found in mandatory parts. Found: {[p.get('part_no') for p in parts]}"
    log(f"   {mandok_part['part_no']}: current_stock={mandok_part.get('current_stock')}, "
        f"threshold_qty={mandok_part.get('threshold_qty')}, is_low={mandok_part.get('is_low')}")
    
    assert "current_stock" in mandok_part, "current_stock not present"
    assert mandok_part["current_stock"] == 500.0, f"Expected current_stock=500.0, got {mandok_part['current_stock']}"
    assert mandok_part["threshold_qty"] == 0.0, f"Expected threshold_qty=0, got {mandok_part['threshold_qty']}"
    assert mandok_part["is_low"] == False, f"Expected is_low=false (threshold_qty=0), got {mandok_part['is_low']}"
    log(f"✅ MANDOK1 correctly NOT flagged as low stock: is_low=false")

def main():
    """Run all tests"""
    print("=" * 80)
    print("BACKEND API TESTING - Hero/TVS Parts Ordering App")
    print("Testing: Per-system DLP, Add-items endpoint, Mandatory parts threshold")
    print("=" * 80)
    
    try:
        # Login
        login()
        
        # Upload inventory
        upload_inventory()
        
        # Test per-system DLP
        test_per_system_dlp()
        
        # Test order uses system DLP
        hero_order_id, tvs_order_id = test_order_uses_system_dlp()
        
        # Test add-items endpoint
        test_add_items_endpoint(hero_order_id)
        
        # Test mandatory parts threshold
        test_mandatory_parts_threshold()
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED")
        print("=" * 80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        raise

if __name__ == "__main__":
    main()
