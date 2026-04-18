"""
Backend API Tests for FinFlow Authentication
Tests: register, login, /auth/me, token validation, auth-protected endpoints
"""
import pytest
import requests
import os

# Use the public URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    # Fallback: read from frontend .env
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


class TestAuthRegister:
    """User registration tests"""
    
    def test_register_new_user(self, api_client):
        """Test creating a new user account"""
        import time
        unique_email = f"test_user_{int(time.time())}@finflow.com"
        
        register_payload = {
            "name": "Test User",
            "email": unique_email,
            "password": "testpass123"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify response structure
        assert "user" in data
        assert "access_token" in data
        assert "refresh_token" in data
        
        # Verify user data
        user = data["user"]
        assert user["name"] == "Test User"
        assert user["email"] == unique_email
        assert user["role"] == "user"
        assert "id" in user
        
        # Verify tokens are strings
        assert isinstance(data["access_token"], str)
        assert isinstance(data["refresh_token"], str)
        assert len(data["access_token"]) > 20
        assert len(data["refresh_token"]) > 20
    
    def test_register_duplicate_email_returns_400(self, api_client):
        """Test that registering with existing email fails"""
        # Try to register with admin email (already exists)
        register_payload = {
            "name": "Duplicate User",
            "email": "admin@finflow.com",
            "password": "anypassword"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert response.status_code == 400
        
        error = response.json()
        assert "detail" in error
        assert "already registered" in error["detail"].lower()


class TestAuthLogin:
    """User login tests"""
    
    def test_login_with_admin_credentials(self, api_client):
        """Test login with admin@finflow.com / admin123"""
        login_payload = {
            "email": "admin@finflow.com",
            "password": "admin123"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify response structure
        assert "user" in data
        assert "access_token" in data
        assert "refresh_token" in data
        
        # Verify user data
        user = data["user"]
        assert user["email"] == "admin@finflow.com"
        assert user["name"] == "Admin"
        assert user["role"] == "admin"
        assert "id" in user
        
        # Verify tokens
        assert isinstance(data["access_token"], str)
        assert isinstance(data["refresh_token"], str)
    
    def test_login_with_invalid_email_returns_401(self, api_client):
        """Test login with non-existent email"""
        login_payload = {
            "email": "nonexistent@finflow.com",
            "password": "anypassword"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 401
        
        error = response.json()
        assert "detail" in error
        assert "invalid" in error["detail"].lower()
    
    def test_login_with_wrong_password_returns_401(self, api_client):
        """Test login with correct email but wrong password"""
        login_payload = {
            "email": "admin@finflow.com",
            "password": "wrongpassword"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 401
        
        error = response.json()
        assert "detail" in error


class TestAuthMe:
    """GET /auth/me endpoint tests"""
    
    def test_auth_me_with_valid_token(self, api_client):
        """Test /auth/me with valid Bearer token"""
        # First login to get token
        login_payload = {
            "email": "admin@finflow.com",
            "password": "admin123"
        }
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200
        
        token = login_response.json()["access_token"]
        
        # Call /auth/me with token
        headers = {"Authorization": f"Bearer {token}"}
        me_response = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        
        user = me_response.json()
        assert user["email"] == "admin@finflow.com"
        assert user["name"] == "Admin"
        assert user["role"] == "admin"
        assert "id" in user
        
        # Verify password_hash is NOT in response
        assert "password_hash" not in user
    
    def test_auth_me_without_token_returns_401(self, api_client):
        """Test /auth/me without Authorization header"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        
        error = response.json()
        assert "detail" in error
        assert "not authenticated" in error["detail"].lower()
    
    def test_auth_me_with_invalid_token_returns_401(self, api_client):
        """Test /auth/me with invalid token"""
        headers = {"Authorization": "Bearer invalid_token_xyz"}
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 401
        
        error = response.json()
        assert "detail" in error


class TestAuthProtectedEndpoints:
    """Test that data endpoints require authentication"""
    
    def test_settings_without_auth_returns_401(self, api_client):
        """Test GET /api/settings without auth token"""
        response = api_client.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 401
    
    def test_settings_with_auth_returns_data(self, api_client):
        """Test GET /api/settings with valid auth token"""
        # Login first
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@finflow.com",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Get settings with auth
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/settings", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "salary" in data
        assert "currency" in data
        assert "pctNeeds" in data
    
    def test_bills_without_auth_returns_401(self, api_client):
        """Test GET /api/bills without auth token"""
        response = api_client.get(f"{BASE_URL}/api/bills")
        assert response.status_code == 401
    
    def test_bills_with_auth_returns_user_scoped_data(self, api_client):
        """Test POST /api/bills with auth creates user-scoped bill"""
        # Login first
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@finflow.com",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create a bill
        bill_payload = {
            "name": "TEST_Auth_Bill",
            "category": "Utilities",
            "amount": 100
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=bill_payload, headers=headers)
        assert create_response.status_code == 200
        
        bill = create_response.json()
        assert bill["name"] == "TEST_Auth_Bill"
        assert "id" in bill
        
        # Verify bill is in user's bills
        get_response = api_client.get(f"{BASE_URL}/api/bills", headers=headers)
        assert get_response.status_code == 200
        
        bills = get_response.json()
        found = any(b["id"] == bill["id"] for b in bills)
        assert found
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bills/{bill['id']}", headers=headers)
    
    def test_dashboard_without_auth_returns_401(self, api_client):
        """Test GET /api/dashboard without auth token"""
        response = api_client.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 401
    
    def test_dashboard_with_auth_returns_user_scoped_data(self, api_client):
        """Test GET /api/dashboard with auth returns user-specific data"""
        # Login first
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@finflow.com",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get dashboard
        response = api_client.get(f"{BASE_URL}/api/dashboard", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "settings" in data
        assert "total_bills" in data
        assert "total_expenses" in data
        assert "net_remaining" in data
        assert "cashflow" in data
    
    def test_expenses_without_auth_returns_401(self, api_client):
        """Test GET /api/expenses without auth token"""
        response = api_client.get(f"{BASE_URL}/api/expenses")
        assert response.status_code == 401
    
    def test_savings_goals_without_auth_returns_401(self, api_client):
        """Test GET /api/savings-goals without auth token"""
        response = api_client.get(f"{BASE_URL}/api/savings-goals")
        assert response.status_code == 401
    
    def test_monthly_history_without_auth_returns_401(self, api_client):
        """Test GET /api/monthly-history without auth token"""
        response = api_client.get(f"{BASE_URL}/api/monthly-history")
        assert response.status_code == 401
    
    def test_process_recurring_without_auth_returns_401(self, api_client):
        """Test POST /api/process-recurring without auth token"""
        response = api_client.post(f"{BASE_URL}/api/process-recurring")
        assert response.status_code == 401


class TestAuthRefresh:
    """Refresh token tests"""
    
    def test_refresh_token_endpoint(self, api_client):
        """Test POST /api/auth/refresh with valid refresh token"""
        # Login first
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@finflow.com",
            "password": "admin123"
        })
        refresh_token = login_response.json()["refresh_token"]
        
        # Refresh access token
        refresh_payload = {"refresh_token": refresh_token}
        refresh_response = api_client.post(f"{BASE_URL}/api/auth/refresh", json=refresh_payload)
        assert refresh_response.status_code == 200
        
        data = refresh_response.json()
        assert "access_token" in data
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 20
    
    def test_refresh_with_invalid_token_returns_401(self, api_client):
        """Test refresh with invalid token"""
        refresh_payload = {"refresh_token": "invalid_refresh_token"}
        response = api_client.post(f"{BASE_URL}/api/auth/refresh", json=refresh_payload)
        assert response.status_code == 401


class TestUserDataScoping:
    """Test that users can only access their own data"""
    
    def test_register_two_users_and_verify_data_isolation(self, api_client):
        """Test that two users have separate data"""
        import time
        
        # Register user 1
        user1_email = f"test_user1_{int(time.time())}@finflow.com"
        user1_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "User One",
            "email": user1_email,
            "password": "pass123"
        })
        user1_token = user1_response.json()["access_token"]
        
        # Register user 2
        user2_email = f"test_user2_{int(time.time())}@finflow.com"
        user2_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "User Two",
            "email": user2_email,
            "password": "pass456"
        })
        user2_token = user2_response.json()["access_token"]
        
        # User 1 creates a bill
        user1_headers = {"Authorization": f"Bearer {user1_token}"}
        bill_payload = {
            "name": "TEST_User1_Bill",
            "category": "Housing",
            "amount": 500
        }
        create_response = api_client.post(f"{BASE_URL}/api/bills", json=bill_payload, headers=user1_headers)
        assert create_response.status_code == 200
        user1_bill_id = create_response.json()["id"]
        
        # User 1 can see their bill
        user1_bills_response = api_client.get(f"{BASE_URL}/api/bills", headers=user1_headers)
        user1_bills = user1_bills_response.json()
        assert any(b["id"] == user1_bill_id for b in user1_bills)
        
        # User 2 cannot see User 1's bill
        user2_headers = {"Authorization": f"Bearer {user2_token}"}
        user2_bills_response = api_client.get(f"{BASE_URL}/api/bills", headers=user2_headers)
        user2_bills = user2_bills_response.json()
        assert not any(b["id"] == user1_bill_id for b in user2_bills)
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/bills/{user1_bill_id}", headers=user1_headers)
