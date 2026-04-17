"""
Backend API Tests for FinFlow Enhancement Features
Tests: monthly-history, monthly-detail, process-recurring, toggle-recurring, reset
"""
import pytest
import requests
import os
from datetime import datetime

# Use the public URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    # Fallback: read from frontend .env
    import sys
    from pathlib import Path
    from dotenv import load_dotenv
    frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
    load_dotenv(frontend_env)
    BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not BASE_URL:
        raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")
BASE_URL = BASE_URL.rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestMonthlyHistory:
    """Monthly History endpoint tests"""
    
    def test_get_monthly_history(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/monthly-history")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Should include current month even if no expenses
        current_month = datetime.now().strftime('%Y-%m')
        month_keys = [m["month"] for m in data]
        assert current_month in month_keys
        
        # Check structure of each month entry
        if len(data) > 0:
            month_entry = data[0]
            assert "month" in month_entry
            assert "salary" in month_entry
            assert "currency" in month_entry
            assert "bills" in month_entry
            assert "expenses" in month_entry
            assert "expense_count" in month_entry
            assert "net" in month_entry
            
            # Validate data types
            assert isinstance(month_entry["salary"], (int, float))
            assert isinstance(month_entry["bills"], (int, float))
            assert isinstance(month_entry["expenses"], (int, float))
            assert isinstance(month_entry["expense_count"], int)
            assert isinstance(month_entry["net"], (int, float))


class TestMonthlyDetail:
    """Monthly Detail endpoint tests"""
    
    def test_get_monthly_detail_current_month(self, api_client):
        current_month = datetime.now().strftime('%Y-%m')
        response = api_client.get(f"{BASE_URL}/api/monthly-detail/{current_month}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check all required fields
        assert "month" in data
        assert "salary" in data
        assert "currency" in data
        assert "total_bills" in data
        assert "total_expenses" in data
        assert "net" in data
        assert "expenses" in data
        assert "bills" in data
        assert "expenses_by_category" in data
        assert "bills_by_category" in data
        
        # Validate data types
        assert isinstance(data["expenses"], list)
        assert isinstance(data["bills"], list)
        assert isinstance(data["expenses_by_category"], list)
        assert isinstance(data["bills_by_category"], list)
        assert isinstance(data["total_bills"], (int, float))
        assert isinstance(data["total_expenses"], (int, float))
        assert isinstance(data["net"], (int, float))
        
        # Verify month matches request
        assert data["month"] == current_month
    
    def test_get_monthly_detail_past_month(self, api_client):
        # Test with a past month (2026-01)
        response = api_client.get(f"{BASE_URL}/api/monthly-detail/2026-01")
        assert response.status_code == 200
        
        data = response.json()
        assert data["month"] == "2026-01"


class TestRecurringExpenses:
    """Recurring expenses processing tests"""
    
    def test_toggle_recurring_on_expense(self, api_client):
        # Create a test expense first
        create_payload = {
            "name": "TEST_Recurring_Subscription",
            "category": "Subscriptions",
            "amount": 9.99,
            "recurring": False
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_response.status_code == 200
        
        expense = create_response.json()
        expense_id = expense["id"]
        assert expense["recurring"] == False
        
        # Toggle recurring to True
        toggle_response = api_client.patch(f"{BASE_URL}/api/expenses/{expense_id}/toggle-recurring")
        assert toggle_response.status_code == 200
        
        toggled_expense = toggle_response.json()
        assert toggled_expense["recurring"] == True
        assert toggled_expense["id"] == expense_id
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/expenses")
        expenses = get_response.json()
        found_expense = next((e for e in expenses if e["id"] == expense_id), None)
        assert found_expense is not None
        assert found_expense["recurring"] == True
        
        # Toggle back to False
        toggle_back_response = api_client.patch(f"{BASE_URL}/api/expenses/{expense_id}/toggle-recurring")
        assert toggle_back_response.status_code == 200
        
        toggled_back = toggle_back_response.json()
        assert toggled_back["recurring"] == False
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_toggle_recurring_nonexistent_expense_returns_404(self, api_client):
        response = api_client.patch(f"{BASE_URL}/api/expenses/nonexistent-id-xyz/toggle-recurring")
        assert response.status_code == 404
    
    def test_process_recurring_expenses(self, api_client):
        # This endpoint processes recurring expenses for the current month
        response = api_client.post(f"{BASE_URL}/api/process-recurring")
        assert response.status_code == 200
        
        data = response.json()
        assert "processed" in data
        assert "created" in data
        assert isinstance(data["processed"], bool)
        assert isinstance(data["created"], int)
        
        # If already processed this month, should return processed=False
        # If not processed, should return processed=True and created count


class TestBillsWithDueDay:
    """Bills with due day field tests"""
    
    def test_create_bill_with_due_day(self, api_client):
        create_payload = {
            "name": "TEST_Electric Bill with Due Day",
            "category": "Utilities",
            "amount": 150,
            "dueDay": 15
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=create_payload)
        assert create_response.status_code == 200
        
        bill = create_response.json()
        assert bill["name"] == "TEST_Electric Bill with Due Day"
        assert bill["dueDay"] == 15
        assert "id" in bill
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/bills")
        bills = get_response.json()
        found_bill = next((b for b in bills if b["id"] == bill["id"]), None)
        assert found_bill is not None
        assert found_bill["dueDay"] == 15
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bills/{bill['id']}")
    
    def test_create_bill_without_due_day(self, api_client):
        create_payload = {
            "name": "TEST_Bill No Due Day",
            "category": "Other",
            "amount": 50
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=create_payload)
        assert create_response.status_code == 200
        
        bill = create_response.json()
        assert bill["dueDay"] is None or "dueDay" not in bill or bill["dueDay"] == None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bills/{bill['id']}")


class TestExpensesWithRecurring:
    """Expenses with recurring field tests"""
    
    def test_create_expense_with_recurring_true(self, api_client):
        create_payload = {
            "name": "TEST_Monthly Gym",
            "category": "Health",
            "amount": 50,
            "recurring": True
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_response.status_code == 200
        
        expense = create_response.json()
        assert expense["name"] == "TEST_Monthly Gym"
        assert expense["recurring"] == True
        assert "id" in expense
        
        # Verify persistence
        get_response = api_client.get(f"{BASE_URL}/api/expenses")
        expenses = get_response.json()
        found_expense = next((e for e in expenses if e["id"] == expense["id"]), None)
        assert found_expense is not None
        assert found_expense["recurring"] == True
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")
    
    def test_create_expense_with_recurring_false(self, api_client):
        create_payload = {
            "name": "TEST_One Time Purchase",
            "category": "Shopping",
            "amount": 100,
            "recurring": False
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_response.status_code == 200
        
        expense = create_response.json()
        assert expense["recurring"] == False
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense['id']}")


class TestResetData:
    """Reset all data endpoint tests"""
    
    def test_reset_all_data(self, api_client):
        # Create some test data first
        api_client.post(f"{BASE_URL}/api/bills", json={
            "name": "TEST_Reset Bill",
            "category": "Other",
            "amount": 100
        })
        api_client.post(f"{BASE_URL}/api/expenses", json={
            "name": "TEST_Reset Expense",
            "category": "Other",
            "amount": 50
        })
        
        # Call reset endpoint
        response = api_client.post(f"{BASE_URL}/api/reset")
        assert response.status_code == 200
        
        data = response.json()
        assert data["reset"] == True
        
        # Verify all data is cleared
        bills_response = api_client.get(f"{BASE_URL}/api/bills")
        bills = bills_response.json()
        assert len(bills) == 0
        
        expenses_response = api_client.get(f"{BASE_URL}/api/expenses")
        expenses = expenses_response.json()
        assert len(expenses) == 0
        
        goals_response = api_client.get(f"{BASE_URL}/api/savings-goals")
        goals = goals_response.json()
        assert len(goals) == 0
        
        # Settings should return defaults after reset
        settings_response = api_client.get(f"{BASE_URL}/api/settings")
        settings = settings_response.json()
        assert "salary" in settings
