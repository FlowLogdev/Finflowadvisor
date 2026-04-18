"""Backend tests for FinFlow AI Advisor endpoints."""
import os
import sys
import time
import requests

BACKEND_URL = "https://cashflow-staging-4.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"
ADMIN_EMAIL = "admin@finflow.com"
ADMIN_PASSWORD = "admin123"

PASS = []
FAIL = []


def log_pass(name, detail=""):
    PASS.append(name)
    print(f"PASS: {name} {detail}")


def log_fail(name, detail=""):
    FAIL.append((name, detail))
    print(f"FAIL: {name} :: {detail}")


def login():
    r = requests.post(f"{API_BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    try:
        token = login()
        log_pass("auth/login admin", f"got token len={len(token)}")
    except Exception as e:
        log_fail("auth/login admin", str(e))
        return
    headers = {"Authorization": f"Bearer {token}"}

    # Ensure clean slate for history tests
    try:
        r = requests.delete(f"{API_BASE}/ai-advisor/history", headers=headers, timeout=15)
        if r.status_code == 200:
            log_pass("initial DELETE /ai-advisor/history cleanup", f"deleted={r.json().get('deleted')}")
        else:
            log_fail("initial cleanup", f"status={r.status_code}")
    except Exception as e:
        log_fail("initial cleanup exception", str(e))

    # Also clear cached daily insight so we can test first-call/cache flow
    try:
        from pymongo import MongoClient
        mc = MongoClient("mongodb://localhost:27017")
        fdb = mc["finflow"]
        # find admin user_id
        u = fdb.users.find_one({"email": ADMIN_EMAIL})
        if u:
            uid = str(u["_id"])
            deleted = fdb.ai_insights.delete_many({"user_id": uid}).deleted_count
            log_pass("clear cached insights for admin", f"deleted={deleted}")
    except Exception as e:
        log_fail("clear cached insights (non-critical)", str(e))

    # ── Test 1: POST /ai-advisor/chat - no auth → 401 ───────────────
    try:
        r = requests.post(f"{API_BASE}/ai-advisor/chat", json={"message": "hi"}, timeout=15)
        if r.status_code in (401, 403):
            log_pass("POST /ai-advisor/chat no-auth → 401", f"status={r.status_code}")
        else:
            log_fail("POST /ai-advisor/chat no-auth", f"expected 401 got {r.status_code} body={r.text[:200]}")
    except Exception as e:
        log_fail("POST /ai-advisor/chat no-auth exception", str(e))

    # ── Test 2: POST /ai-advisor/chat - empty message → 400 ─────────
    try:
        r = requests.post(f"{API_BASE}/ai-advisor/chat", headers=headers, json={"message": ""}, timeout=15)
        if r.status_code == 400:
            log_pass("POST /ai-advisor/chat empty message → 400", f"body={r.text[:120]}")
        else:
            log_fail("POST /ai-advisor/chat empty", f"expected 400 got {r.status_code} body={r.text[:200]}")
    except Exception as e:
        log_fail("POST /ai-advisor/chat empty exception", str(e))

    # ── Test 3: POST /ai-advisor/chat - first message ───────────────
    session_id = None
    try:
        r = requests.post(f"{API_BASE}/ai-advisor/chat", headers=headers,
                          json={"message": "How can I save $500 this month?"}, timeout=30)
        if r.status_code == 200:
            body = r.json()
            session_id = body.get("session_id")
            reply = body.get("reply", "")
            if session_id and reply and len(reply.strip()) > 10:
                log_pass("POST /ai-advisor/chat first message",
                         f"session={session_id[:8]}… reply_len={len(reply)}")
            else:
                log_fail("POST /ai-advisor/chat first message",
                         f"missing session/reply: {body}")
        else:
            log_fail("POST /ai-advisor/chat first", f"status={r.status_code} body={r.text[:300]}")
    except Exception as e:
        log_fail("POST /ai-advisor/chat first exception", str(e))

    # ── Test 4: Multi-turn follow-up with same session_id ───────────
    if session_id:
        try:
            r = requests.post(f"{API_BASE}/ai-advisor/chat", headers=headers,
                              json={"message": "Give me one specific example from that list.",
                                    "session_id": session_id}, timeout=30)
            if r.status_code == 200:
                body = r.json()
                if body.get("session_id") == session_id and body.get("reply"):
                    log_pass("POST /ai-advisor/chat multi-turn",
                             f"same session, reply_len={len(body['reply'])}")
                else:
                    log_fail("POST /ai-advisor/chat multi-turn",
                             f"session mismatch or empty reply: {body}")
            else:
                log_fail("POST /ai-advisor/chat multi-turn", f"status={r.status_code} body={r.text[:300]}")
        except Exception as e:
            log_fail("POST /ai-advisor/chat multi-turn exception", str(e))

    # ── Test 5: Context injection — salary & budget split ───────────
    try:
        r = requests.post(f"{API_BASE}/ai-advisor/chat", headers=headers,
                          json={"message": "What's my salary and budget split?"}, timeout=30)
        if r.status_code == 200:
            reply = r.json().get("reply", "")
            low = reply.lower()
            has_salary = ("5000" in reply.replace(",", "") or "5,000" in reply or "$5000" in reply or "$5,000" in reply)
            has_split = (("50" in reply and "30" in reply and "20" in reply) or "50/30/20" in reply)
            if has_salary and has_split:
                log_pass("Context injection salary+split",
                         f"reply has salary 5000 and 50/30/20. snippet={reply[:200]!r}")
            else:
                log_fail("Context injection salary+split",
                         f"has_salary={has_salary} has_split={has_split} reply={reply[:400]!r}")
        else:
            log_fail("Context injection chat", f"status={r.status_code} body={r.text[:300]}")
    except Exception as e:
        log_fail("Context injection exception", str(e))

    # ── Test 6: GET /ai-advisor/history — no auth → 401 ─────────────
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/history", timeout=10)
        if r.status_code in (401, 403):
            log_pass("GET /ai-advisor/history no-auth → 401", f"status={r.status_code}")
        else:
            log_fail("GET /ai-advisor/history no-auth", f"expected 401 got {r.status_code}")
    except Exception as e:
        log_fail("GET /ai-advisor/history no-auth exception", str(e))

    # ── Test 7: GET /ai-advisor/history (all) ───────────────────────
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/history", headers=headers, timeout=15)
        if r.status_code == 200:
            msgs = r.json().get("messages", [])
            roles = [m.get("role") for m in msgs]
            has_user = "user" in roles
            has_assistant = "assistant" in roles
            ordered = all(msgs[i].get("timestamp", "") <= msgs[i + 1].get("timestamp", "") for i in range(len(msgs) - 1))
            if len(msgs) >= 2 and has_user and has_assistant and ordered:
                log_pass("GET /ai-advisor/history all",
                         f"count={len(msgs)} roles_sample={roles[:6]} ordered=True")
            else:
                log_fail("GET /ai-advisor/history all",
                         f"count={len(msgs)} has_user={has_user} has_asst={has_assistant} ordered={ordered}")
        else:
            log_fail("GET /ai-advisor/history all", f"status={r.status_code} body={r.text[:300]}")
    except Exception as e:
        log_fail("GET /ai-advisor/history all exception", str(e))

    # ── Test 8: GET /ai-advisor/history?session_id=... filter ───────
    if session_id:
        try:
            r = requests.get(f"{API_BASE}/ai-advisor/history",
                             headers=headers, params={"session_id": session_id}, timeout=15)
            if r.status_code == 200:
                msgs = r.json().get("messages", [])
                all_match = all(m.get("session_id") == session_id for m in msgs)
                if msgs and all_match:
                    log_pass("GET /ai-advisor/history filtered",
                             f"count={len(msgs)} all match session={session_id[:8]}…")
                else:
                    log_fail("GET /ai-advisor/history filtered",
                             f"count={len(msgs)} all_match={all_match}")
            else:
                log_fail("GET /ai-advisor/history filtered", f"status={r.status_code}")
        except Exception as e:
            log_fail("GET /ai-advisor/history filtered exception", str(e))

    # ── Test 9: GET /ai-advisor/insight — no auth → 401 ─────────────
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/insight", timeout=10)
        if r.status_code in (401, 403):
            log_pass("GET /ai-advisor/insight no-auth → 401", f"status={r.status_code}")
        else:
            log_fail("GET /ai-advisor/insight no-auth", f"expected 401 got {r.status_code}")
    except Exception as e:
        log_fail("GET /ai-advisor/insight no-auth exception", str(e))

    # ── Test 10: GET /ai-advisor/insight first call (cached=false) ──
    first_insight = None
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/insight", headers=headers, timeout=30)
        if r.status_code == 200:
            body = r.json()
            first_insight = body.get("insight", "")
            cached = body.get("cached")
            if first_insight and cached is False:
                log_pass("GET /ai-advisor/insight first call",
                         f"cached=False, insight_len={len(first_insight)}")
            else:
                log_fail("GET /ai-advisor/insight first call",
                         f"cached={cached} insight_len={len(first_insight)} body={body}")
        else:
            log_fail("GET /ai-advisor/insight first call", f"status={r.status_code} body={r.text[:300]}")
    except Exception as e:
        log_fail("GET /ai-advisor/insight first call exception", str(e))

    # ── Test 11: GET /ai-advisor/insight second call (cached=true, same text) ──
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/insight", headers=headers, timeout=30)
        if r.status_code == 200:
            body = r.json()
            if body.get("cached") is True and body.get("insight") == first_insight and first_insight:
                log_pass("GET /ai-advisor/insight second call",
                         "cached=True and text matches first call")
            else:
                log_fail("GET /ai-advisor/insight second call",
                         f"cached={body.get('cached')} same_text={body.get('insight') == first_insight}")
        else:
            log_fail("GET /ai-advisor/insight second call", f"status={r.status_code}")
    except Exception as e:
        log_fail("GET /ai-advisor/insight second call exception", str(e))

    # ── Test 12: DELETE /ai-advisor/history — no auth → 401 ─────────
    try:
        r = requests.delete(f"{API_BASE}/ai-advisor/history", timeout=10)
        if r.status_code in (401, 403):
            log_pass("DELETE /ai-advisor/history no-auth → 401", f"status={r.status_code}")
        else:
            log_fail("DELETE /ai-advisor/history no-auth", f"expected 401 got {r.status_code}")
    except Exception as e:
        log_fail("DELETE /ai-advisor/history no-auth exception", str(e))

    # ── Test 13: DELETE /ai-advisor/history (authenticated) ─────────
    try:
        r = requests.delete(f"{API_BASE}/ai-advisor/history", headers=headers, timeout=15)
        if r.status_code == 200:
            n = r.json().get("deleted")
            if isinstance(n, int) and n > 0:
                log_pass("DELETE /ai-advisor/history", f"deleted={n}")
            else:
                log_fail("DELETE /ai-advisor/history", f"unexpected body: {r.json()}")
        else:
            log_fail("DELETE /ai-advisor/history", f"status={r.status_code}")
    except Exception as e:
        log_fail("DELETE /ai-advisor/history exception", str(e))

    # ── Test 14: GET /ai-advisor/history after delete is empty ──────
    try:
        r = requests.get(f"{API_BASE}/ai-advisor/history", headers=headers, timeout=15)
        if r.status_code == 200:
            msgs = r.json().get("messages", [])
            if msgs == []:
                log_pass("GET /ai-advisor/history after delete", "messages=[] as expected")
            else:
                log_fail("GET /ai-advisor/history after delete", f"expected [] got {len(msgs)} msgs")
        else:
            log_fail("GET /ai-advisor/history after delete", f"status={r.status_code}")
    except Exception as e:
        log_fail("GET /ai-advisor/history after delete exception", str(e))

    # ── Summary ─────────────────────────────────────────────────────
    print("\n\n========== SUMMARY ==========")
    print(f"Passed: {len(PASS)}")
    print(f"Failed: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for name, det in FAIL:
            print(f"  - {name} :: {det}")
    return len(FAIL) == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
