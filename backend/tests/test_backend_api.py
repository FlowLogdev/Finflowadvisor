"""
Backend API Tests for FinFlow
Tests all CRUD operations for settings, bills, expenses, savings goals, and dashboard
"""
import pytest
import requests
import os

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


class TestHealth:
    """Health check endpoint"""
    
    def test_health_check(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestSettings:
    """Settings endpoint tests"""
    
    def test_get_settings_returns_defaults(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        
        data = response.json()
        assert "salary" in data
        assert "currency" in data
        assert "pctNeeds" in data
        assert "pctWants" in data
        assert "pctSavings" in data
        assert isinstance(data["salary"], (int, float))
    
    def test_update_settings(self, api_client):
        # Update settings
        update_payload = {
            "salary": 6000,
            "currency": "€",
            "pctNeeds": 55,
            "pctWants": 25,
            "pctSavings": 20
        }
        update_response = api_client.put(f"{BASE_URL}/api/settings", json=update_payload)
        assert update_response.status_code == 200
        
        updated_data = update_response.json()
        assert updated_data["salary"] == 6000
        assert updated_data["currency"] == "€"
        assert updated_data["pctNeeds"] == 55
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/settings")
        assert get_response.status_code == 200
        
        persisted_data = get_response.json()
        assert persisted_data["salary"] == 6000
        assert persisted_data["currency"] == "€"


class TestBills:
    """Bills CRUD tests"""
    
    def test_get_bills(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/bills")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_bill_and_verify_persistence(self, api_client):
        # Create bill
        create_payload = {
            "name": "TEST_Internet Bill",
            "category": "Utilities",
            "amount": 80.50
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=create_payload)
        assert create_response.status_code == 200
        
        created_bill = create_response.json()
        assert created_bill["name"] == "TEST_Internet Bill"
        assert created_bill["category"] == "Utilities"
        assert created_bill["amount"] == 80.50
        assert "id" in created_bill
        
        bill_id = created_bill["id"]
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/bills")
        assert get_response.status_code == 200
        
        bills = get_response.json()
        found_bill = next((b for b in bills if b["id"] == bill_id), None)
        assert found_bill is not None
        assert found_bill["name"] == "TEST_Internet Bill"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bills/{bill_id}")
    
    def test_delete_bill(self, api_client):
        # Create a bill first
        create_payload = {
            "name": "TEST_Delete Bill",
            "category": "Other",
            "amount": 50
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=create_payload)
        bill_id = create_response.json()["id"]
        
        # Delete the bill
        delete_response = api_client.delete(f"{BASE_URL}/api/bills/{bill_id}")
        assert delete_response.status_code == 200
        
        delete_data = delete_response.json()
        assert delete_data["deleted"] == True
        
        # Verify deletion with GET
        get_response = api_client.get(f"{BASE_URL}/api/bills")
        bills = get_response.json()
        found_bill = next((b for b in bills if b["id"] == bill_id), None)
        assert found_bill is None
    
    def test_delete_nonexistent_bill_returns_404(self, api_client):
        response = api_client.delete(f"{BASE_URL}/api/bills/nonexistent-id-12345")
        assert response.status_code == 404


class TestExpenses:
    """Expenses CRUD tests"""
    
    def test_get_expenses(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_expense_and_verify_persistence(self, api_client):
        # Create expense
        create_payload = {
            "name": "TEST_Coffee",
            "category": "Dining",
            "amount": 5.50,
            "date": "2026-01-15"
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_response.status_code == 200
        
        created_expense = create_response.json()
        assert created_expense["name"] == "TEST_Coffee"
        assert created_expense["category"] == "Dining"
        assert created_expense["amount"] == 5.50
        assert created_expense["date"] == "2026-01-15"
        assert "id" in created_expense
        
        expense_id = created_expense["id"]
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/expenses")
        assert get_response.status_code == 200
        
        expenses = get_response.json()
        found_expense = next((e for e in expenses if e["id"] == expense_id), None)
        assert found_expense is not None
        assert found_expense["name"] == "TEST_Coffee"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
    
    def test_create_expense_without_date_uses_default(self, api_client):
        # Create expense without date
        create_payload = {
            "name": "TEST_No Date Expense",
            "category": "Other",
            "amount": 10
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        assert create_response.status_code == 200
        
        created_expense = create_response.json()
        assert "date" in created_expense
        assert len(created_expense["date"]) == 10  # YYYY-MM-DD format
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{created_expense['id']}")
    
    def test_delete_expense(self, api_client):
        # Create an expense first
        create_payload = {
            "name": "TEST_Delete Expense",
            "category": "Other",
            "amount": 25
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=create_payload)
        expense_id = create_response.json()["id"]
        
        # Delete the expense
        delete_response = api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        assert delete_response.status_code == 200
        
        delete_data = delete_response.json()
        assert delete_data["deleted"] == True
        
        # Verify deletion with GET
        get_response = api_client.get(f"{BASE_URL}/api/expenses")
        expenses = get_response.json()
        found_expense = next((e for e in expenses if e["id"] == expense_id), None)
        assert found_expense is None
    
    def test_delete_nonexistent_expense_returns_404(self, api_client):
        response = api_client.delete(f"{BASE_URL}/api/expenses/nonexistent-id-67890")
        assert response.status_code == 404


class TestSavingsGoals:
    """Savings Goals CRUD tests"""
    
    def test_get_savings_goals(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/savings-goals")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_savings_goal_and_verify_persistence(self, api_client):
        # Create savings goal
        create_payload = {
            "name": "TEST_Emergency Fund",
            "target": 10000,
            "saved": 2000
        }
        create_response = api_client.post(f"{BASE_URL}/api/savings-goals", json=create_payload)
        assert create_response.status_code == 200
        
        created_goal = create_response.json()
        assert created_goal["name"] == "TEST_Emergency Fund"
        assert created_goal["target"] == 10000
        assert created_goal["saved"] == 2000
        assert "id" in created_goal
        
        goal_id = created_goal["id"]
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/savings-goals")
        assert get_response.status_code == 200
        
        goals = get_response.json()
        found_goal = next((g for g in goals if g["id"] == goal_id), None)
        assert found_goal is not None
        assert found_goal["name"] == "TEST_Emergency Fund"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/savings-goals/{goal_id}")
    
    def test_update_savings_goal(self, api_client):
        # Create a goal first
        create_payload = {
            "name": "TEST_Vacation",
            "target": 5000,
            "saved": 1000
        }
        create_response = api_client.post(f"{BASE_URL}/api/savings-goals", json=create_payload)
        goal_id = create_response.json()["id"]
        
        # Update the goal
        update_payload = {
            "saved": 2500
        }
        update_response = api_client.put(f"{BASE_URL}/api/savings-goals/{goal_id}", json=update_payload)
        assert update_response.status_code == 200
        
        updated_goal = update_response.json()
        assert updated_goal["saved"] == 2500
        assert updated_goal["name"] == "TEST_Vacation"  # Other fields unchanged
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/savings-goals")
        goals = get_response.json()
        found_goal = next((g for g in goals if g["id"] == goal_id), None)
        assert found_goal["saved"] == 2500
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/savings-goals/{goal_id}")
    
    def test_update_nonexistent_goal_returns_404(self, api_client):
        update_payload = {"saved": 100}
        response = api_client.put(f"{BASE_URL}/api/savings-goals/nonexistent-id", json=update_payload)
        assert response.status_code == 404
    
    def test_delete_savings_goal(self, api_client):
        # Create a goal first
        create_payload = {
            "name": "TEST_Delete Goal",
            "target": 1000,
            "saved": 0
        }
        create_response = api_client.post(f"{BASE_URL}/api/savings-goals", json=create_payload)
        goal_id = create_response.json()["id"]
        
        # Delete the goal
        delete_response = api_client.delete(f"{BASE_URL}/api/savings-goals/{goal_id}")
        assert delete_response.status_code == 200
        
        delete_data = delete_response.json()
        assert delete_data["deleted"] == True
        
        # Verify deletion with GET
        get_response = api_client.get(f"{BASE_URL}/api/savings-goals")
        goals = get_response.json()
        found_goal = next((g for g in goals if g["id"] == goal_id), None)
        assert found_goal is None
    
    def test_delete_nonexistent_goal_returns_404(self, api_client):
        response = api_client.delete(f"{BASE_URL}/api/savings-goals/nonexistent-id-abc")
        assert response.status_code == 404


class TestDashboard:
    """Dashboard endpoint tests"""
    
    def test_get_dashboard_returns_aggregated_data(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check all required fields
        assert "settings" in data
        assert "total_bills" in data
        assert "total_expenses" in data
        assert "net_remaining" in data
        assert "bills_by_category" in data
        assert "expenses_by_category" in data
        assert "budget_comparison" in data
        assert "smart_tip" in data
        assert "savings_goals" in data
        assert "all_spending" in data
        assert "cashflow" in data
        
        # Validate data types
        assert isinstance(data["total_bills"], (int, float))
        assert isinstance(data["total_expenses"], (int, float))
        assert isinstance(data["net_remaining"], (int, float))
        assert isinstance(data["bills_by_category"], list)
        assert isinstance(data["expenses_by_category"], list)
        assert isinstance(data["smart_tip"], str)
        assert isinstance(data["savings_goals"], list)
        assert isinstance(data["all_spending"], list)
        
        # Validate budget_comparison structure
        assert "needs" in data["budget_comparison"]
        assert "wants" in data["budget_comparison"]
        assert "savings" in data["budget_comparison"]
        assert "target" in data["budget_comparison"]["needs"]
        assert "actual" in data["budget_comparison"]["needs"]
        
        # Validate cashflow structure
        assert "income" in data["cashflow"]
        assert "bills" in data["cashflow"]
        assert "expenses" in data["cashflow"]
        assert "net" in data["cashflow"]
    
    def test_dashboard_calculates_totals_correctly(self, api_client):
        # Get current dashboard state
        response = api_client.get(f"{BASE_URL}/api/dashboard")
        data = response.json()
        
        # Verify net_remaining calculation
        expected_net = data["settings"]["salary"] - data["total_bills"] - data["total_expenses"]
        assert abs(data["net_remaining"] - expected_net) < 0.01  # Allow for floating point precision
        
        # Verify cashflow net calculation
        expected_cashflow_net = data["cashflow"]["income"] - data["cashflow"]["bills"] - data["cashflow"]["expenses"]
        assert abs(data["cashflow"]["net"] - expected_cashflow_net) < 0.01
