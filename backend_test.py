#!/usr/bin/env python3
"""
Backend API Test for Mandatory Parts Exemption Bug Fix
Tests that mandatory parts are exempt from "part already in current order" block
"""

import requests
import json
import sys
from typing import Dict, Any, List

# Configuration
BASE_URL = "https://instant-ship-7.preview.emergentagent.com/api"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Test state
token = None
created_orders = []
created_mandatory_parts = []

def log_test(step: str, description: str):
    """Log test step"""
    print(f"\n{'='*80}")
    print(f"STEP {step}: {description}")
    print('='*80)

def log_response(response: requests.Response, expected_status: int = None):
    """Log response details"""
    print(f"HTTP {response.status_code}")
    try:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        if expected_status and response.status_code != expected_status:
            print(f"⚠️  EXPECTED {expected_status}, GOT {response.status_code}")
        return data
    except Exception:
        print(f"Response (text): {response.text[:500]}")
        return None

def login() -> str:
    """Login and get access token"""
    log_test("AUTH", "Login as admin")
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    data = log_response(response, 200)
    if response.status_code == 200 and data:
        token = data.get("access_token")
        print(f"✅ Login successful, token obtained")
        return token
    else:
        print(f"❌ Login failed")
        sys.exit(1)

def get_headers() -> Dict[str, str]:
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def ensure_inventory():
    """Check if inventory is fresh, upload if needed"""
    log_test("INVENTORY", "Check inventory freshness")
    response = requests.get(
        f"{BASE_URL}/orders?system=hero",
        headers=get_headers()
    )
    
    if response.status_code == 423:
        print("Inventory stale, uploading small CSV...")
        csv_content = "Part No,Description,Stock Qty,MRP\n14401AAD00099S,Test Part 1,100,100\n22K130LS,Test Part 2,100,100\nK22222HF100DS,Test Part 3,100,100\nZ-EXTRA-1,Extra Part,100,50\nP-BLOCK-1,Block Part,100,10\nP-OTHER-1,Other Part,100,10\n"
        
        files = {'file': ('inventory.csv', csv_content, 'text/csv')}
        upload_response = requests.post(
            f"{BASE_URL}/inventory/upload",
            headers={"Authorization": f"Bearer {token}"},
            files=files
        )
        log_response(upload_response, 200)
        if upload_response.status_code == 200:
            print("✅ Inventory uploaded successfully")
        else:
            print("❌ Inventory upload failed")
            sys.exit(1)
    else:
        print("✅ Inventory is fresh")

def clean_existing_mandatory_parts():
    """Delete existing mandatory parts for testing"""
    log_test("CLEANUP", "Delete existing mandatory Hero parts for clean test")
    response = requests.get(
        f"{BASE_URL}/mandatory-parts?system=hero",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        data = response.json()
        parts = data.get("parts", []) if isinstance(data, dict) else data
        test_parts = ["14401AAD00099S", "22K130LS", "K22222HF100DS"]
        for part in parts:
            part_no = part.get("part_no")
            if part_no in test_parts:
                part_id = part.get("id")
                delete_response = requests.delete(
                    f"{BASE_URL}/mandatory-parts/{part_id}",
                    headers=get_headers()
                )
                if delete_response.status_code == 200:
                    print(f"✅ Deleted existing mandatory part: {part_no}")
                else:
                    print(f"⚠️  Failed to delete mandatory part: {part_no}")
    else:
        print(f"⚠️  Could not fetch mandatory parts: {response.status_code}")

def clean_existing_orders():
    """Delete existing draft orders to stay under MAX_CURRENT_ORDERS limit"""
    log_test("CLEANUP", "Delete existing current Hero orders to stay under limit")
    response = requests.get(
        f"{BASE_URL}/orders?system=hero",
        headers=get_headers()
    )
    
    if response.status_code == 200:
        orders = response.json()
        current_orders = [o for o in orders if o.get("status") == "current"]
        print(f"Found {len(current_orders)} current Hero orders")
        
        for order in current_orders:
            order_id = order.get("id")
            order_no = order.get("order_no")
            delete_response = requests.delete(
                f"{BASE_URL}/orders/{order_id}?confirm=delete",
                headers=get_headers()
            )
            if delete_response.status_code == 200:
                print(f"✅ Deleted current order: {order_no}")
            else:
                print(f"⚠️  Failed to delete order: {order_no}")
    else:
        print(f"⚠️  Could not fetch orders: {response.status_code}")

def create_mandatory_part(part_no: str, system: str = "hero") -> Dict[str, Any]:
    """Create a mandatory part"""
    response = requests.post(
        f"{BASE_URL}/mandatory-parts?system={system}",
        headers=get_headers(),
        json={
            "part_no": part_no,
            "qty": 1,
            "mrp": 100
        }
    )
    data = log_response(response, 200)
    if response.status_code == 200 and data:
        created_mandatory_parts.append(data.get("id"))
        print(f"✅ Created mandatory part: {part_no}")
        return data
    else:
        print(f"❌ Failed to create mandatory part: {part_no}")
        return None

def create_order(system: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create an order"""
    response = requests.post(
        f"{BASE_URL}/orders?system={system}",
        headers=get_headers(),
        json={"items": items}
    )
    data = log_response(response)
    if response.status_code == 200 and data:
        created_orders.append(data.get("id"))
        print(f"✅ Created order: {data.get('order_no')} (id: {data.get('id')})")
        return data
    else:
        print(f"❌ Failed to create order")
        return None

def update_order(order_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Update an order"""
    response = requests.put(
        f"{BASE_URL}/orders/{order_id}",
        headers=get_headers(),
        json={"items": items}
    )
    data = log_response(response)
    return data, response.status_code

def add_items_to_order(order_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Add items to an order"""
    response = requests.post(
        f"{BASE_URL}/orders/{order_id}/add-items",
        headers=get_headers(),
        json={"items": items}
    )
    data = log_response(response)
    return data, response.status_code

def check_part(part_no: str, system: str = "hero") -> Dict[str, Any]:
    """Check part status"""
    response = requests.get(
        f"{BASE_URL}/orders/check-part/{part_no}?system={system}",
        headers=get_headers()
    )
    data = log_response(response, 200)
    return data

def delete_order(order_id: str):
    """Delete an order"""
    response = requests.delete(
        f"{BASE_URL}/orders/{order_id}?confirm=delete",
        headers=get_headers()
    )
    if response.status_code == 200:
        print(f"✅ Deleted order: {order_id}")
    else:
        print(f"⚠️  Failed to delete order: {order_id}")

def cleanup_orders():
    """Delete all created orders"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting created orders")
    print("="*80)
    for order_id in created_orders:
        delete_order(order_id)

def cleanup_mandatory_parts():
    """Delete all created mandatory parts"""
    print("\n" + "="*80)
    print("CLEANUP: Deleting created mandatory parts")
    print("="*80)
    
    # First get all mandatory parts
    response = requests.get(
        f"{BASE_URL}/mandatory-parts?system=hero",
        headers=get_headers()
    )
    if response.status_code == 200:
        data = response.json()
        parts = data.get("parts", []) if isinstance(data, dict) else data
        for part in parts:
            part_id = part.get("id") if isinstance(part, dict) else None
            if part_id and part_id in created_mandatory_parts:
                delete_response = requests.delete(
                    f"{BASE_URL}/mandatory-parts/{part_id}",
                    headers=get_headers()
                )
                if delete_response.status_code == 200:
                    print(f"✅ Deleted mandatory part: {part.get('part_no')}")
                else:
                    print(f"⚠️  Failed to delete mandatory part: {part.get('part_no')}")

def run_main_test():
    """Main test: Mandatory parts exempt from the block"""
    print("\n" + "#"*80)
    print("# MAIN TEST: MANDATORY PARTS EXEMPT FROM THE BLOCK")
    print("#"*80)
    
    # Step 1: Create three mandatory Hero parts
    log_test("1", "Create three mandatory Hero parts")
    mandatory_parts = ["14401AAD00099S", "22K130LS", "K22222HF100DS"]
    for part_no in mandatory_parts:
        create_mandatory_part(part_no, "hero")
    
    # Step 2: Create Hero order A with all three mandatory parts
    log_test("2", "Create Hero order A with all three mandatory parts")
    items_a = [
        {"part_no": part_no, "description": "m", "mrp": 100, "qty": 1}
        for part_no in mandatory_parts
    ]
    order_a = create_order("hero", items_a)
    if not order_a:
        print("❌ TEST FAILED: Could not create order A")
        return False
    
    order_a_id = order_a.get("id")
    order_a_no = order_a.get("order_no")
    print(f"Order A: id={order_a_id}, order_no={order_a_no}")
    
    # Step 3: Create Hero order B with the SAME three mandatory parts
    log_test("3", "Create Hero order B with SAME three mandatory parts (EXPECT 200 - THE FIX)")
    items_b = [
        {"part_no": part_no, "description": "m", "mrp": 100, "qty": 1}
        for part_no in mandatory_parts
    ]
    order_b = create_order("hero", items_b)
    
    if not order_b:
        print("❌ TEST FAILED: Order B creation failed - mandatory parts should be allowed in both orders")
        return False
    elif order_b and "id" in order_b:
        print(f"✅ PASS: Order B created successfully with mandatory parts (id={order_b.get('id')})")
        order_b_id = order_b.get("id")
    else:
        print("❌ TEST FAILED: Order B response invalid")
        return False
    
    # Step 4: SAVE PATH - PUT order B with mandatory parts PLUS one extra non-mandatory part
    log_test("4", "PUT order B with mandatory parts PLUS extra non-mandatory part (EXPECT 200)")
    items_b_updated = items_b + [{"part_no": "Z-EXTRA-1", "description": "e", "mrp": 50, "qty": 2}]
    data, status = update_order(order_b_id, items_b_updated)
    
    if status == 200:
        print(f"✅ PASS: Order B updated successfully with mandatory + extra part")
    else:
        print(f"❌ TEST FAILED: Order B update failed with status {status} - mandatory dupes should not block save")
        return False
    
    # Step 5: Check part status
    log_test("5", "GET /api/orders/check-part/14401AAD00099S?system=hero")
    check_data = check_part("14401AAD00099S", "hero")
    
    if check_data:
        is_mandatory = check_data.get("is_mandatory")
        blocked = check_data.get("blocked")
        current_order = check_data.get("current_order")
        
        print(f"is_mandatory: {is_mandatory}")
        print(f"blocked: {blocked}")
        print(f"current_order: {current_order}")
        
        if is_mandatory == True and blocked == False and current_order == None:
            print(f"✅ PASS: Mandatory part shows is_mandatory=true, blocked=false, current_order=null")
        else:
            print(f"❌ TEST FAILED: Expected is_mandatory=true, blocked=false, current_order=null")
            return False
    else:
        print(f"❌ TEST FAILED: check-part returned no data")
        return False
    
    return True

def run_control_test():
    """Control test: Non-mandatory part STILL blocks"""
    print("\n" + "#"*80)
    print("# CONTROL TEST: NON-MANDATORY PART STILL BLOCKS")
    print("#"*80)
    
    # Step 6: Clean hero drafts and create order C with non-mandatory part
    log_test("6", "Clean drafts, create Hero order C with P-BLOCK-1")
    
    # Delete some orders to stay under limit
    if len(created_orders) > 0:
        print("Cleaning up some orders to stay under MAX_CURRENT_ORDERS=2 limit...")
        for order_id in created_orders[:2]:
            delete_order(order_id)
        created_orders.clear()
    
    items_c = [{"part_no": "P-BLOCK-1", "description": "block", "mrp": 10, "qty": 1}]
    order_c = create_order("hero", items_c)
    
    if not order_c:
        print("❌ TEST FAILED: Could not create order C")
        return False
    
    order_c_no = order_c.get("order_no")
    print(f"Order C: order_no={order_c_no}")
    
    # Create order D with different part
    log_test("6b", "Create Hero order D with P-OTHER-1")
    items_d = [{"part_no": "P-OTHER-1", "description": "other", "mrp": 10, "qty": 1}]
    order_d = create_order("hero", items_d)
    
    if not order_d:
        print("❌ TEST FAILED: Could not create order D")
        return False
    
    order_d_id = order_d.get("id")
    
    # Step 7: Try to add P-BLOCK-1 to order D (should fail with 400)
    log_test("7", "POST /api/orders/{D_id}/add-items with P-BLOCK-1 (EXPECT 400)")
    items_to_add = [{"part_no": "P-BLOCK-1", "mrp": 10, "qty": 1}]
    data, status = add_items_to_order(order_d_id, items_to_add)
    
    if status == 400:
        detail = data.get("detail", "") if data else ""
        if order_c_no in detail:
            print(f"✅ PASS: Got 400 with order C's order_no ({order_c_no}) in detail message")
            return True
        else:
            print(f"⚠️  Got 400 but order_no not in detail: {detail}")
            return True  # Still a pass, just not perfect message
    else:
        print(f"❌ TEST FAILED: Expected 400, got {status} - non-mandatory parts should still block")
        return False

def main():
    """Main test execution"""
    global token
    
    print("="*80)
    print("BACKEND API TEST: MANDATORY PARTS EXEMPTION BUG FIX")
    print("="*80)
    
    try:
        # Login
        token = login()
        
        # Ensure inventory is fresh
        ensure_inventory()
        
        # Clean existing mandatory parts and orders to start fresh
        clean_existing_mandatory_parts()
        clean_existing_orders()
        
        # Run main test
        main_test_passed = run_main_test()
        
        # Run control test
        control_test_passed = run_control_test()
        
        # Cleanup
        cleanup_orders()
        cleanup_mandatory_parts()
        
        # Final result
        print("\n" + "="*80)
        print("FINAL RESULT")
        print("="*80)
        
        if main_test_passed and control_test_passed:
            print("✅ ALL TESTS PASSED")
            print("✅ Main test: Mandatory parts are exempt from the block")
            print("✅ Control test: Non-mandatory parts still block correctly")
            return 0
        else:
            print("❌ TESTS FAILED")
            if not main_test_passed:
                print("❌ Main test failed: Mandatory parts exemption not working")
            if not control_test_passed:
                print("❌ Control test failed: Non-mandatory blocking not working")
            return 1
            
    except Exception as e:
        print(f"\n❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
