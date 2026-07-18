"""
Backend API Tests for Plaid bank-account sync
Tests: auth requirement, premium enforcement, and (when Plaid Sandbox
credentials + a premium test account are configured) the full
exchange -> sync -> re-sync idempotency loop.
"""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    from pathlib import Path
    from dotenv import load_dotenv
    frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
    load_dotenv(frontend_env)
    BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not BASE_URL:
        raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")
BASE_URL = BASE_URL.rstrip('/')

PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID')
PLAID_SECRET = os.environ.get('PLAID_SECRET')
# A test account already granted premium on the features backend -- premium status
# can't be self-provisioned by these tests, it's controlled by a separate service.
PLAID_TEST_PREMIUM_EMAIL = os.environ.get('PLAID_TEST_PREMIUM_EMAIL')
PLAID_TEST_PREMIUM_PASSWORD = os.environ.get('PLAID_TEST_PREMIUM_PASSWORD')


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _register_fresh_user(api_client) -> str:
    """Registers a brand-new (non-premium) user and returns its access token."""
    unique_email = f"test_plaid_{int(time.time() * 1000)}@finflow.com"
    resp = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "name": "Plaid Test User",
        "email": unique_email,
        "password": "testpass123",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


class TestPlaidAuth:
    def test_plaid_link_token_requires_auth(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/plaid/link-token")
        assert response.status_code == 401

    def test_plaid_status_requires_auth(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/plaid/status")
        assert response.status_code == 401


class TestPlaidPremiumGate:
    """
    Highest-value automated coverage: a non-premium user must be rejected with
    403 before any Plaid API call is made, and this must hold even if the
    caller bypasses the app UI entirely and hits the endpoint directly. Runs
    with zero Plaid credentials needed -- it should 403 before ever reaching
    Plaid.
    """

    def test_link_token_requires_premium(self, api_client):
        token = _register_fresh_user(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.post(f"{BASE_URL}/api/plaid/link-token", headers=headers)
        assert response.status_code == 403

    def test_sync_requires_premium(self, api_client):
        token = _register_fresh_user(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.post(f"{BASE_URL}/api/plaid/sync", headers=headers)
        assert response.status_code == 403

    def test_status_requires_premium(self, api_client):
        token = _register_fresh_user(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        response = api_client.get(f"{BASE_URL}/api/plaid/status", headers=headers)
        assert response.status_code == 403


@pytest.mark.skipif(
    not (PLAID_CLIENT_ID and PLAID_SECRET and PLAID_TEST_PREMIUM_EMAIL and PLAID_TEST_PREMIUM_PASSWORD),
    reason="Requires PLAID_CLIENT_ID/PLAID_SECRET (Sandbox) and PLAID_TEST_PREMIUM_EMAIL/"
           "PLAID_TEST_PREMIUM_PASSWORD (a premium test account) in the environment",
)
class TestPlaidSyncIdempotency:
    """
    Exercises the full exchange -> sync -> re-sync loop against Plaid Sandbox.
    Uses Plaid's own /sandbox/public_token/create endpoint to obtain a public_token
    server-to-server (no Link UI needed), so this can run headlessly in CI when
    Sandbox credentials are present.
    """

    def _premium_headers(self, api_client) -> dict:
        resp = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": PLAID_TEST_PREMIUM_EMAIL,
            "password": PLAID_TEST_PREMIUM_PASSWORD,
        })
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def _sandbox_public_token(self, api_client) -> str:
        resp = api_client.post("https://sandbox.plaid.com/sandbox/public_token/create", json={
            "client_id": PLAID_CLIENT_ID,
            "secret": PLAID_SECRET,
            "institution_id": "ins_109508",  # Plaid's standard full-featured Sandbox institution
            "initial_products": ["transactions"],
        })
        assert resp.status_code == 200, resp.text
        return resp.json()["public_token"]

    def test_exchange_and_sync_is_idempotent(self, api_client):
        headers = self._premium_headers(api_client)
        public_token = self._sandbox_public_token(api_client)

        exchange_resp = api_client.post(
            f"{BASE_URL}/api/plaid/exchange", headers=headers,
            json={"public_token": public_token, "institution_name": "Platypus Bank"},
        )
        assert exchange_resp.status_code == 200, exchange_resp.text
        item_id = exchange_resp.json()["item_id"]

        try:
            first_sync = api_client.post(f"{BASE_URL}/api/plaid/sync", headers=headers)
            assert first_sync.status_code == 200, first_sync.text
            first_data = first_sync.json()
            assert first_data["items_synced"] >= 1

            second_sync = api_client.post(f"{BASE_URL}/api/plaid/sync", headers=headers)
            assert second_sync.status_code == 200, second_sync.text
            second_data = second_sync.json()

            # The idempotency guarantee: re-syncing immediately must not create
            # any new expenses (or removed count) -- everything was already imported.
            assert second_data["expenses_created"] == 0
            assert second_data["removed"] == 0

            status_resp = api_client.get(f"{BASE_URL}/api/plaid/status", headers=headers)
            assert status_resp.status_code == 200
            assert status_resp.json()["connected"] is True
        finally:
            api_client.delete(f"{BASE_URL}/api/plaid/item/{item_id}", headers=headers)
