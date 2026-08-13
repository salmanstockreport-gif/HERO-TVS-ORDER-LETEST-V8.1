#!/usr/bin/env python3
"""
Backend test for order blocking rules:
RULE 1: A part cannot exist in more than one CURRENT (draft) order of the same system (HARD BLOCK, HTTP 400)
RULE 2: Recent-sent WARNING (within 7 days, NON-blocking)
"""

import requests
import json
import sys
import os
from io import BytesIO

# Base URL from frontend/.env
BASE_URL = "https://instant-ship-7.preview.emergentagent.com/api"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_success(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def log_error(msg):
    print(f"{RED}❌ {msg}{RESET}")

def log_info(msg):
    print(f"{BLUE}ℹ️  {msg}{RESET}")

def log_warning(msg):
    print(f"{YELLOW}⚠️  {msg}{RESET}")

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def add_pass(self, test_name):
        self.passed += 1
        log_success(f"PASS: {test_name}")
    
    def add_fail(self, test_name, reason):
        self.failed += 1
        self.errors.append(f"{test_name}: {reason}")
        log_error(f"FAIL: {test_name} - {reason}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"\n{RED}FAILED TESTS:{RESET}")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*80}\n")
        return self.failed == 0

def login(username, password):
    """Login and return access token"""
    log_info(f"Logging in as {username}...")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            if token:
                log_success(f"Login successful, token obtained")
                return token
            else:
                log_error(f"Login response missing access_token: {data}")
                return None
        else:
            log_error(f"Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        log_error(f"Login exception: {e}")
        return None

def upload_tiny_inventory(headers):
    """Upload a tiny inventory so the 24h freshness gate passes"""
    log_info("Uploading tiny inventory for freshness gate...")
    try:
        # Create a minimal CSV with 2 parts
        csv_content = "Part No,Stock Qty\nP-BLOCK-1,100\nP-OTHER-1,100\nP-SENT-1,100\n"
        files = {"file": ("inventory.csv", BytesIO(csv_content.encode()), "text/csv")}
        response = requests.post(f"{BASE_URL}/inventory/upload", headers=headers, files=files, timeout=30)
        
        if response.status_code == 200:
            log_success("Inventory uploaded successfully")
            return True
        else:
            log_error(f"Inventory upload failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        log_error(f"Inventory upload exception: {e}")
        return False

def test_order_blocking_rules():
    """Test RULE 1 (blocking) and RULE 2 (recent-sent warning)"""
    results = TestResults()
    
    print(f"\n{'='*80}")
    print(f"ORDER BLOCKING RULES TEST")
    print(f"RULE 1: Part cannot exist in two CURRENT orders (same system) - HARD BLOCK")
    print(f"RULE 2: Recent-sent WARNING (7 days, non-blocking)")
    print(f"{'='*80}\n")
    
    # Login
    log_info("STEP 0: Login as admin/admin123")
    token = login(ADMIN_USERNAME, ADMIN_PASSWORD)
    if not token:
        results.add_fail("Step 0: Login", "Failed to obtain access token")
        return results
    results.add_pass("Step 0: Login successful")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Upload inventory
    log_info("\nSTEP 0b: Upload tiny inventory for freshness gate")
    if not upload_tiny_inventory(headers):
        results.add_fail("Step 0b: Inventory upload", "Failed to upload inventory")
        return results
    results.add_pass("Step 0b: Inventory uploaded successfully")
    
    # RULE 1 - BLOCKING TESTS
    print(f"\n{BLUE}{'='*80}")
    print(f"RULE 1: BLOCKING TESTS (same part in two CURRENT orders)")
    print(f"{'='*80}{RESET}\n")
    
    # Step a: Create Hero order A with part P-BLOCK-1
    log_info("STEP a: Create Hero order A with part P-BLOCK-1")
    try:
        order_a_payload = {
            "items": [
                {
                    "part_no": "P-BLOCK-1",
                    "description": "Test Part Block 1",
                    "mrp": 100.0,
                    "qty": 2
                }
            ],
            "remarks": "Order A with P-BLOCK-1"
        }
        response = requests.post(
            f"{BASE_URL}/orders?system=hero",
            headers=headers,
            json=order_a_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            order_a = response.json()
            order_a_id = order_a.get("id")
            order_a_no = order_a.get("order_no")
            log_success(f"Order A created: id={order_a_id}, order_no={order_a_no}")
            results.add_pass(f"Step a: Create Hero order A (HTTP 200, order_no={order_a_no})")
        else:
            results.add_fail("Step a: Create order A", f"Expected 200, got {response.status_code} - {response.text}")
            return results
    except Exception as e:
        results.add_fail("Step a: Create order A", f"Exception: {e}")
        return results
    
    # Step b: Create Hero order B with a DIFFERENT part P-OTHER-1
    log_info("\nSTEP b: Create Hero order B with DIFFERENT part P-OTHER-1")
    try:
        order_b_payload = {
            "items": [
                {
                    "part_no": "P-OTHER-1",
                    "description": "Test Part Other 1",
                    "mrp": 50.0,
                    "qty": 1
                }
            ],
            "remarks": "Order B with P-OTHER-1"
        }
        response = requests.post(
            f"{BASE_URL}/orders?system=hero",
            headers=headers,
            json=order_b_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            order_b = response.json()
            order_b_id = order_b.get("id")
            order_b_no = order_b.get("order_no")
            log_success(f"Order B created: id={order_b_id}, order_no={order_b_no}")
            results.add_pass(f"Step b: Create Hero order B (HTTP 200, order_no={order_b_no})")
        else:
            results.add_fail("Step b: Create order B", f"Expected 200, got {response.status_code} - {response.text}")
            return results
    except Exception as e:
        results.add_fail("Step b: Create order B", f"Exception: {e}")
        return results
    
    # Step c: Try to add conflicting part to B via SAVE (PUT)
    log_info("\nSTEP c: Try to add P-BLOCK-1 to order B via PUT (SAVE) - EXPECT HTTP 400")
    try:
        update_payload = {
            "items": [
                {
                    "part_no": "P-OTHER-1",
                    "description": "Test Part Other 1",
                    "mrp": 50.0,
                    "qty": 1
                },
                {
                    "part_no": "P-BLOCK-1",
                    "description": "Test Part Block 1",
                    "mrp": 100.0,
                    "qty": 2
                }
            ],
            "remarks": "Trying to add P-BLOCK-1 to order B"
        }
        response = requests.put(
            f"{BASE_URL}/orders/{order_b_id}",
            headers=headers,
            json=update_payload,
            timeout=10
        )
        
        if response.status_code == 400:
            error_detail = response.json().get("detail", "")
            if order_a_no in error_detail:
                log_success(f"Correctly blocked with HTTP 400, error mentions order A's order_no: {order_a_no}")
                results.add_pass(f"Step c: PUT blocked (HTTP 400, mentions order_no={order_a_no})")
            else:
                results.add_fail("Step c: PUT error message", f"HTTP 400 but error doesn't mention order A's order_no. Error: {error_detail}")
        else:
            results.add_fail("Step c: PUT blocking", f"Expected 400, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step c: PUT blocking", f"Exception: {e}")
    
    # Step d: Try via add-items endpoint
    log_info("\nSTEP d: Try to add P-BLOCK-1 to order B via POST add-items - EXPECT HTTP 400")
    try:
        add_items_payload = {
            "items": [
                {
                    "part_no": "P-BLOCK-1",
                    "description": "Test Part Block 1",
                    "mrp": 100.0,
                    "qty": 1
                }
            ]
        }
        response = requests.post(
            f"{BASE_URL}/orders/{order_b_id}/add-items",
            headers=headers,
            json=add_items_payload,
            timeout=10
        )
        
        if response.status_code == 400:
            error_detail = response.json().get("detail", "")
            log_success(f"Correctly blocked with HTTP 400. Error: {error_detail}")
            results.add_pass(f"Step d: POST add-items blocked (HTTP 400)")
        else:
            results.add_fail("Step d: POST add-items blocking", f"Expected 400, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step d: POST add-items blocking", f"Exception: {e}")
    
    # Step e: GET check-part endpoint
    log_info("\nSTEP e: GET /api/orders/check-part/P-BLOCK-1?system=hero&exclude_order_id={order_b_id}")
    try:
        response = requests.get(
            f"{BASE_URL}/orders/check-part/P-BLOCK-1?system=hero&exclude_order_id={order_b_id}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            check_data = response.json()
            blocked = check_data.get("blocked")
            current_order = check_data.get("current_order")
            
            log_info(f"check-part response: blocked={blocked}, current_order={current_order}")
            
            if blocked is True:
                results.add_pass("Step e: check-part blocked=true")
            else:
                results.add_fail("Step e: check-part blocked", f"Expected blocked=true, got {blocked}")
            
            if current_order and current_order.get("order_no") == order_a_no:
                results.add_pass(f"Step e: check-part current_order.order_no={order_a_no}")
            else:
                results.add_fail("Step e: check-part current_order", f"Expected order_no={order_a_no}, got {current_order}")
        else:
            results.add_fail("Step e: check-part", f"Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step e: check-part", f"Exception: {e}")
    
    # Step f: Try to create a new order at create-time with P-BLOCK-1 (if at limit, delete B first)
    log_info("\nSTEP f: Try to create new Hero order with P-BLOCK-1 at create-time - EXPECT HTTP 400")
    try:
        # First check if we're at the limit (MAX_CURRENT_ORDERS=2)
        # We have order A and order B, so we're at the limit. Delete order B first.
        log_info(f"Deleting order B (id={order_b_id}) to free up capacity...")
        delete_response = requests.delete(f"{BASE_URL}/orders/{order_b_id}", headers=headers, timeout=10)
        if delete_response.status_code == 200:
            log_success(f"Order B deleted successfully")
        else:
            log_warning(f"Failed to delete order B: {delete_response.status_code} - {delete_response.text}")
        
        # Now try to create a new order with P-BLOCK-1
        order_c_payload = {
            "items": [
                {
                    "part_no": "P-BLOCK-1",
                    "description": "Test Part Block 1",
                    "mrp": 100.0,
                    "qty": 1
                }
            ],
            "remarks": "Order C trying to use P-BLOCK-1"
        }
        response = requests.post(
            f"{BASE_URL}/orders?system=hero",
            headers=headers,
            json=order_c_payload,
            timeout=10
        )
        
        if response.status_code == 400:
            error_detail = response.json().get("detail", "")
            if order_a_no in error_detail or "P-BLOCK-1" in error_detail:
                log_success(f"Correctly blocked at create-time with HTTP 400. Error: {error_detail}")
                results.add_pass(f"Step f: POST create blocked (HTTP 400, part still in order A)")
            else:
                results.add_fail("Step f: POST create error message", f"HTTP 400 but error doesn't mention the conflict. Error: {error_detail}")
        else:
            results.add_fail("Step f: POST create blocking", f"Expected 400, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step f: POST create blocking", f"Exception: {e}")
    
    # Step g: CROSS-SYSTEM must NOT block
    log_info("\nSTEP g: GET /api/orders/check-part/P-BLOCK-1?system=tvs - EXPECT blocked=false")
    try:
        response = requests.get(
            f"{BASE_URL}/orders/check-part/P-BLOCK-1?system=tvs",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            check_data = response.json()
            blocked = check_data.get("blocked")
            
            log_info(f"check-part (TVS) response: blocked={blocked}")
            
            if blocked is False:
                log_success(f"Correctly NOT blocked for TVS system (Hero current order doesn't affect TVS)")
                results.add_pass("Step g: check-part TVS blocked=false (cross-system doesn't block)")
            else:
                results.add_fail("Step g: check-part TVS", f"Expected blocked=false, got {blocked}")
        else:
            results.add_fail("Step g: check-part TVS", f"Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step g: check-part TVS", f"Exception: {e}")
    
    # RULE 2 - RECENT-SENT WARNING TESTS
    print(f"\n{BLUE}{'='*80}")
    print(f"RULE 2: RECENT-SENT WARNING TESTS (7 days, non-blocking)")
    print(f"{'='*80}{RESET}\n")
    
    # Step h: Create a Hero order with part P-SENT-1, then mark it sent
    log_info("STEP h: Create Hero order with P-SENT-1 and mark it sent")
    try:
        order_sent_payload = {
            "items": [
                {
                    "part_no": "P-SENT-1",
                    "description": "Test Part Sent 1",
                    "mrp": 75.0,
                    "qty": 3
                }
            ],
            "remarks": "Order to be sent with P-SENT-1"
        }
        response = requests.post(
            f"{BASE_URL}/orders?system=hero",
            headers=headers,
            json=order_sent_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            order_sent = response.json()
            order_sent_id = order_sent.get("id")
            order_sent_no = order_sent.get("order_no")
            log_success(f"Order created: id={order_sent_id}, order_no={order_sent_no}")
            
            # Mark it as sent
            log_info(f"Marking order {order_sent_no} as sent...")
            mark_sent_response = requests.post(
                f"{BASE_URL}/orders/{order_sent_id}/mark-sent",
                headers=headers,
                timeout=10
            )
            
            if mark_sent_response.status_code == 200:
                log_success(f"Order {order_sent_no} marked as sent")
                results.add_pass(f"Step h: Create and mark order as sent (order_no={order_sent_no})")
            else:
                results.add_fail("Step h: Mark sent", f"Expected 200, got {mark_sent_response.status_code} - {mark_sent_response.text}")
                return results
        else:
            results.add_fail("Step h: Create order for sent", f"Expected 200, got {response.status_code} - {response.text}")
            return results
    except Exception as e:
        results.add_fail("Step h: Create and mark sent", f"Exception: {e}")
        return results
    
    # Step i: GET check-part for P-SENT-1
    log_info("\nSTEP i: GET /api/orders/check-part/P-SENT-1?system=hero")
    try:
        response = requests.get(
            f"{BASE_URL}/orders/check-part/P-SENT-1?system=hero",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            check_data = response.json()
            blocked = check_data.get("blocked")
            recent_sent = check_data.get("recent_sent")
            recent_sent_window_days = check_data.get("recent_sent_window_days")
            
            log_info(f"check-part response: blocked={blocked}, recent_sent={recent_sent}, recent_sent_window_days={recent_sent_window_days}")
            
            # EXPECT: blocked=false (sent orders don't block)
            if blocked is False:
                results.add_pass("Step i: check-part blocked=false (sent orders don't block)")
            else:
                results.add_fail("Step i: check-part blocked", f"Expected blocked=false, got {blocked}")
            
            # EXPECT: recent_sent is NOT null
            if recent_sent is not None:
                results.add_pass("Step i: check-part recent_sent is NOT null")
                
                # EXPECT: recent_sent.order_no matches the sent order
                if recent_sent.get("order_no") == order_sent_no:
                    results.add_pass(f"Step i: check-part recent_sent.order_no={order_sent_no}")
                else:
                    results.add_fail("Step i: check-part recent_sent.order_no", f"Expected {order_sent_no}, got {recent_sent.get('order_no')}")
            else:
                results.add_fail("Step i: check-part recent_sent", "Expected recent_sent to be NOT null, got null")
            
            # EXPECT: recent_sent_window_days=7
            if recent_sent_window_days == 7:
                results.add_pass("Step i: check-part recent_sent_window_days=7")
            else:
                results.add_fail("Step i: check-part recent_sent_window_days", f"Expected 7, got {recent_sent_window_days}")
        else:
            results.add_fail("Step i: check-part P-SENT-1", f"Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step i: check-part P-SENT-1", f"Exception: {e}")
    
    # Step j: Confirm P-SENT-1 can be added to a NEW current order (not blocked)
    log_info("\nSTEP j: Create new Hero order with P-SENT-1 - EXPECT HTTP 200 (not blocked)")
    try:
        order_new_payload = {
            "items": [
                {
                    "part_no": "P-SENT-1",
                    "description": "Test Part Sent 1",
                    "mrp": 75.0,
                    "qty": 1
                }
            ],
            "remarks": "New order with P-SENT-1 (should not be blocked)"
        }
        response = requests.post(
            f"{BASE_URL}/orders?system=hero",
            headers=headers,
            json=order_new_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            order_new = response.json()
            order_new_id = order_new.get("id")
            order_new_no = order_new.get("order_no")
            log_success(f"New order created successfully: id={order_new_id}, order_no={order_new_no}")
            results.add_pass(f"Step j: Create order with P-SENT-1 (HTTP 200, not blocked by sent order)")
        else:
            results.add_fail("Step j: Create order with P-SENT-1", f"Expected 200, got {response.status_code} - {response.text}")
    except Exception as e:
        results.add_fail("Step j: Create order with P-SENT-1", f"Exception: {e}")
    
    return results

if __name__ == "__main__":
    results = test_order_blocking_rules()
    success = results.summary()
    sys.exit(0 if success else 1)
