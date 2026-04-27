"""
Backend Tests for DELETE /api/auth/account (Apple App Store compliance, Guideline 5.1.1)
+ regression smoke for admin-only auth endpoints.

Runs against the public preview URL, which routes /api to the FastAPI backend.
"""

import os
import sys
import uuid
import json
import requests

BASE_URL = "https://cashflow-staging-4.preview.emergentagent.com/api"
ADMIN_EMAIL = "support@finflowadvisors.com"
ADMIN_PASSWORD = "Fabio@123"

results = []  # list of (name, passed, detail)

def record(name: str, passed: bool, detail: str = ""):
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {name}  {detail}")
    results.append((name, passed, detail))


def hjson(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:300]}


def main():
    # ── 1. UNAUTHENTICATED DELETE → 401 ────────────────────────────────
    r = requests.delete(f"{BASE_URL}/auth/account", timeout=15)
    record(
        "1. Unauthenticated DELETE /api/auth/account → 401",
        r.status_code == 401,
        f"got status={r.status_code} body={hjson(r)}",
    )

    # ── 2. FULL FLOW: register → seed data → delete ───────────────────
    new_email = f"delete-test-{uuid.uuid4().hex[:8]}@example.com"
    new_pw = "P@ssw0rd-DeleteTest!23"
    new_name = "Fabio Delete Test"

    r = requests.post(
        f"{BASE_URL}/auth/register",
        json={"name": new_name, "email": new_email, "password": new_pw},
        timeout=15,
    )
    if r.status_code != 200 or "access_token" not in (r.json() or {}):
        record("2a. POST /auth/register fresh user", False, f"status={r.status_code} body={hjson(r)}")
        print("Cannot continue, registration failed.")
        return summarize()
    body = r.json()
    token = body["access_token"]
    user_id = body["user"]["id"]
    record(
        "2a. POST /auth/register fresh user",
        True,
        f"status=200 user_id={user_id} email={new_email}",
    )
    H = {"Authorization": f"Bearer {token}"}

    # ── 2b. Seed: bill, expense, settings update with salary ──────────
    bill_resp = requests.post(
        f"{BASE_URL}/bills",
        json={"name": "Apartment Rent", "category": "Housing", "amount": 1450.00, "dueDay": 5},
        headers=H, timeout=15,
    )
    record(
        "2b. POST /bills (Housing rent $1450)",
        bill_resp.status_code == 200,
        f"status={bill_resp.status_code} resp={hjson(bill_resp)}",
    )

    exp_resp = requests.post(
        f"{BASE_URL}/expenses",
        json={"name": "Whole Foods grocery run", "category": "Groceries", "amount": 87.43},
        headers=H, timeout=15,
    )
    record(
        "2b. POST /expenses (Groceries $87.43)",
        exp_resp.status_code == 200,
        f"status={exp_resp.status_code} resp={hjson(exp_resp)}",
    )

    set_resp = requests.put(
        f"{BASE_URL}/settings",
        json={"salary": 7500, "currency": "$", "pctNeeds": 50, "pctWants": 30, "pctSavings": 20},
        headers=H, timeout=15,
    )
    record(
        "2b. PUT /settings (salary $7500)",
        set_resp.status_code == 200 and set_resp.json().get("salary") == 7500,
        f"status={set_resp.status_code} resp={hjson(set_resp)}",
    )

    # ── 6 (pre-step): /dashboard should show seeded data ──────────────
    dash_resp = requests.get(f"{BASE_URL}/dashboard", headers=H, timeout=15)
    pre_pass = False
    pre_detail = ""
    if dash_resp.status_code == 200:
        d = dash_resp.json()
        pre_detail = (
            f"total_bills={d.get('total_bills')} total_expenses={d.get('total_expenses')} "
            f"settings.salary={d.get('settings',{}).get('salary')}"
        )
        pre_pass = (
            float(d.get("total_bills", 0)) == 1450.00
            and float(d.get("total_expenses", 0)) == 87.43
            and float(d.get("settings", {}).get("salary", 0)) == 7500
        )
    record(
        "6a. GET /dashboard before delete shows seeded data",
        pre_pass,
        f"status={dash_resp.status_code} {pre_detail}",
    )

    # ── 2c. DELETE /auth/account ──────────────────────────────────────
    del_resp = requests.delete(f"{BASE_URL}/auth/account", headers=H, timeout=15)
    record(
        "2c. DELETE /auth/account → 200 {deleted: true}",
        del_resp.status_code == 200 and (del_resp.json() or {}).get("deleted") is True,
        f"status={del_resp.status_code} body={hjson(del_resp)}",
    )

    # ── 3. After deletion, GET /auth/me with old token → 401 ──────────
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=H, timeout=15)
    record(
        "3. GET /auth/me after delete with old token → 401",
        me_resp.status_code == 401,
        f"status={me_resp.status_code} body={hjson(me_resp)}",
    )

    # ── 4. After deletion, login should fail → 401 ────────────────────
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": new_email, "password": new_pw},
        timeout=15,
    )
    record(
        "4. POST /auth/login after delete → 401",
        login_resp.status_code == 401,
        f"status={login_resp.status_code} body={hjson(login_resp)}",
    )

    # ── 5. Re-register SAME email succeeds ────────────────────────────
    re_resp = requests.post(
        f"{BASE_URL}/auth/register",
        json={"name": new_name, "email": new_email, "password": new_pw},
        timeout=15,
    )
    re_pass = re_resp.status_code == 200 and "access_token" in (re_resp.json() or {})
    new_token = re_resp.json().get("access_token") if re_pass else None
    new_user_id = re_resp.json().get("user", {}).get("id") if re_pass else None
    record(
        "5. POST /auth/register SAME email after delete → 200 with new token",
        re_pass and new_user_id != user_id,
        f"status={re_resp.status_code} new_user_id={new_user_id} (old was {user_id}) "
        f"different={new_user_id != user_id}",
    )

    if not new_token:
        print("Cannot continue, re-registration failed.")
        return summarize_and_cleanup()

    H2 = {"Authorization": f"Bearer {new_token}"}

    # ── 6 (post). /dashboard with NEW token shows ZERO bills/expenses ─
    dash2 = requests.get(f"{BASE_URL}/dashboard", headers=H2, timeout=15)
    post_pass = False
    post_detail = ""
    if dash2.status_code == 200:
        d = dash2.json()
        post_detail = (
            f"total_bills={d.get('total_bills')} total_expenses={d.get('total_expenses')} "
            f"bills_by_category={d.get('bills_by_category')} "
            f"expenses_by_category={d.get('expenses_by_category')} "
            f"settings.salary={d.get('settings',{}).get('salary')}"
        )
        post_pass = (
            float(d.get("total_bills", -1)) == 0
            and float(d.get("total_expenses", -1)) == 0
            and len(d.get("bills_by_category", []) or []) == 0
            and len(d.get("expenses_by_category", []) or []) == 0
        )
    record(
        "6b. GET /dashboard with NEW token shows ZERO bills+expenses (data wiped)",
        post_pass,
        f"status={dash2.status_code} {post_detail}",
    )

    # cleanup: delete reborn account so we don't leave junk users
    requests.delete(f"{BASE_URL}/auth/account", headers=H2, timeout=15)

    # ── 7. Regression smoke: admin still works for key endpoints ──────
    al = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    admin_pass = al.status_code == 200 and "access_token" in (al.json() or {})
    record(
        "7a. Admin POST /auth/login (support@finflowadvisors.com / Fabio@123)",
        admin_pass,
        f"status={al.status_code} role={al.json().get('user',{}).get('role') if admin_pass else 'n/a'}",
    )
    if not admin_pass:
        return summarize()
    AH = {"Authorization": f"Bearer {al.json()['access_token']}"}

    for label, path, method in [
        ("7b. GET /immune-score", "/immune-score", "GET"),
        ("7c. GET /subscription-graveyard", "/subscription-graveyard", "GET"),
        ("7d. POST /future-self", "/future-self", "POST"),
        ("7e. GET /investments/rates", "/investments/rates", "GET"),
    ]:
        if method == "GET":
            rr = requests.get(f"{BASE_URL}{path}", headers=AH, timeout=20)
        else:
            rr = requests.post(f"{BASE_URL}{path}", headers=AH, json={}, timeout=30)
        ok = rr.status_code == 200
        body = hjson(rr)
        snippet = ""
        if isinstance(body, dict):
            snippet = ", ".join(f"{k}={('...' if isinstance(v,(dict,list)) else v)}" for k, v in list(body.items())[:4])
        record(label, ok, f"status={rr.status_code} {snippet}")

    return summarize()


def summarize():
    total = len(results)
    passed = sum(1 for _, p, _ in results if p)
    print()
    print("=" * 70)
    print(f"RESULTS: {passed}/{total} passed")
    print("=" * 70)
    for name, p, detail in results:
        if not p:
            print(f"  FAIL: {name} | {detail}")
    return 0 if passed == total else 1


def summarize_and_cleanup():
    return summarize()


if __name__ == "__main__":
    sys.exit(main())
