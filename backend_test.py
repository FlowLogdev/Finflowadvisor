"""
Backend tests for new endpoints:
- GET  /api/immune-score
- GET  /api/subscription-graveyard
- PATCH /api/subscription-graveyard/{id}/toggle-unused
- POST /api/future-self
- POST /api/ai-advisor/chat (live FX context)
- Regression: /api/auth/login, /api/dashboard, /api/insights,
  /api/investments/rates, /api/markets/fx
"""
import os
import sys
import json
import re
import time
import requests
from pathlib import Path

# Load backend URL from frontend .env (public URL is EXPO_PUBLIC_BACKEND_URL)
FRONTEND_ENV = Path("/app/frontend/.env")
BASE = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE = line.split("=", 1)[1].strip().strip('"')
        break
assert BASE, "Could not find EXPO_PUBLIC_BACKEND_URL"
API = BASE.rstrip("/") + "/api"
print(f"[CONFIG] API base: {API}")

ADMIN_EMAIL = "admin@finflow.com"
ADMIN_PASSWORD = "eWcukKTEp0WMtHyaoT8ovZt0"

results = []

def record(name: str, ok: bool, detail: str = ""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}" + (f"  ::  {detail}" if detail else ""))
    results.append((name, ok, detail))


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Login first ───────────────────────────────────────────────────
print("\n=== Auth ===")
r = requests.post(f"{API}/auth/login",
                  json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                  timeout=30)
record("POST /auth/login admin", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
assert r.status_code == 200, "Cannot proceed without JWT"
TOKEN = r.json().get("token") or r.json().get("access_token")
assert TOKEN, f"No token in login response: {r.json()}"
H = auth_headers(TOKEN)
print(f"[INFO] JWT acquired (len={len(TOKEN)})")


# ────────────────────────────────────────────────────────────────
# 1) /api/immune-score
# ────────────────────────────────────────────────────────────────
print("\n=== /api/immune-score ===")
r = requests.get(f"{API}/immune-score", timeout=30)
record("immune-score no token → 401", r.status_code == 401, f"got {r.status_code}")

r = requests.get(f"{API}/immune-score", headers=H, timeout=30)
record("immune-score auth → 200", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    j = r.json()
    needed_keys = {"score", "level", "color", "description", "factors", "tips", "currency"}
    record("immune-score has top-level keys",
           needed_keys.issubset(set(j.keys())),
           f"keys={sorted(j.keys())}")
    score = j.get("score", -1)
    record("immune-score score 0..100",
           isinstance(score, int) and 0 <= score <= 100,
           f"score={score}")
    level = j.get("level")
    record("immune-score level valid",
           level in ("Resilient", "Stable", "Vulnerable", "At Risk"),
           f"level={level}")
    color = j.get("color", "")
    record("immune-score color is hex",
           isinstance(color, str) and re.match(r"^#[0-9a-fA-F]{6}$", color) is not None,
           f"color={color}")
    factors = j.get("factors", {})
    fok = True
    sub_scores = []
    for key, maxv in [("emergency_fund", 35), ("obligation_ratio", 35), ("savings_rate", 30)]:
        f = factors.get(key, {})
        if not isinstance(f, dict):
            fok = False
            break
        if not all(k in f for k in ("score", "max", "label")):
            fok = False
            break
        if f.get("max") != maxv:
            fok = False
            break
        sub_scores.append(f.get("score"))
    record("immune-score factors shape",
           fok,
           f"factors={factors}")
    if fok:
        s_sum = sum(sub_scores)
        diff = abs(s_sum - min(score, 100))
        record("immune-score factor scores sum ~= total (±2 tolerance or capped at 100)",
               diff <= 2 or (s_sum >= 100 and score == 100),
               f"sum={s_sum} total={score} diff={diff}")
    tips = j.get("tips", None)
    record("immune-score tips is list", isinstance(tips, list), f"tips_type={type(tips).__name__}")
    print(f"[DATA] immune-score = {json.dumps(j, indent=2)[:800]}")


# ────────────────────────────────────────────────────────────────
# 2) /api/subscription-graveyard (auth + shape)
# ────────────────────────────────────────────────────────────────
print("\n=== /api/subscription-graveyard ===")
r = requests.get(f"{API}/subscription-graveyard", timeout=30)
record("graveyard no token → 401", r.status_code == 401, f"got {r.status_code}")

r = requests.get(f"{API}/subscription-graveyard", headers=H, timeout=30)
record("graveyard auth → 200", r.status_code == 200, f"status={r.status_code}")
graveyard0 = r.json() if r.status_code == 200 else {}
baseline_total_monthly = 0
baseline_waste_monthly = 0
if graveyard0:
    required = {"subscriptions", "total_monthly", "total_annual",
                "total_waste_monthly", "total_waste_annual", "currency", "months_active"}
    record("graveyard top-level keys present",
           required.issubset(graveyard0.keys()),
           f"keys={sorted(graveyard0.keys())}")
    baseline_total_monthly = graveyard0.get("total_monthly", 0)
    baseline_waste_monthly = graveyard0.get("total_waste_monthly", 0)
    print(f"[DATA] baseline months_active={graveyard0.get('months_active')}, total_monthly={baseline_total_monthly}, total_waste={baseline_waste_monthly}")


# 2b) POST a Subscriptions bill and verify it appears + cumulative math
print("\n=== Create Subscriptions bill and verify graveyard ===")
BILL_NAME = f"Netflix-Test-{int(time.time())}"
bill_payload = {"name": BILL_NAME, "category": "Subscriptions", "amount": 15.99, "dueDay": 5}
r = requests.post(f"{API}/bills", headers=H, json=bill_payload, timeout=30)
record("POST /bills (Subscriptions)", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
created_bill_id = r.json().get("id") if r.status_code == 200 else None
print(f"[DATA] new bill id={created_bill_id}")

if created_bill_id:
    r = requests.get(f"{API}/subscription-graveyard", headers=H, timeout=30)
    graveyard1 = r.json() if r.status_code == 200 else {}
    subs = graveyard1.get("subscriptions", [])
    hit = next((s for s in subs if s.get("id") == created_bill_id), None)
    record("created sub appears in graveyard",
           hit is not None,
           f"found={hit is not None}; total_subs={len(subs)}")
    if hit:
        record("created sub has required fields",
               all(k in hit for k in ("id", "name", "monthly_cost", "cumulative_cost",
                                      "months_active", "marked_unused", "type",
                                      "category", "is_buried")),
               f"keys={sorted(hit.keys())}")
        record("created sub monthly_cost == 15.99",
               abs(hit.get("monthly_cost", 0) - 15.99) < 0.001,
               f"monthly={hit.get('monthly_cost')}")
        record("created sub type == 'bill'",
               hit.get("type") == "bill",
               f"type={hit.get('type')}")
        record("created sub category == 'Subscriptions'",
               hit.get("category") == "Subscriptions",
               f"category={hit.get('category')}")
        record("created sub is_buried False initially",
               hit.get("is_buried") is False,
               f"is_buried={hit.get('is_buried')}")
        expected_cum = round(hit.get("monthly_cost", 0) * hit.get("months_active", 0), 2)
        record("cumulative_cost == monthly * months_active",
               abs(hit.get("cumulative_cost", 0) - expected_cum) < 0.01,
               f"cumulative={hit.get('cumulative_cost')} expected={expected_cum} months={hit.get('months_active')}")


# ────────────────────────────────────────────────────────────────
# 3) PATCH /api/subscription-graveyard/{id}/toggle-unused
# ────────────────────────────────────────────────────────────────
print("\n=== PATCH /subscription-graveyard/{id}/toggle-unused ===")
r = requests.patch(f"{API}/subscription-graveyard/{created_bill_id}/toggle-unused", timeout=30)
record("toggle no token → 401", r.status_code == 401, f"got {r.status_code}")

r = requests.patch(f"{API}/subscription-graveyard/does-not-exist-uuid/toggle-unused",
                   headers=H, timeout=30)
record("toggle bad id → 404", r.status_code == 404, f"got {r.status_code} body={r.text[:200]}")

r = requests.patch(f"{API}/subscription-graveyard/{created_bill_id}/toggle-unused",
                   headers=H, timeout=30)
record("toggle #1 → 200", r.status_code == 200, f"status={r.status_code}")
mu1 = r.json().get("marked_unused") if r.status_code == 200 else None
record("toggle #1 marked_unused True", mu1 is True, f"marked_unused={mu1}")

r = requests.get(f"{API}/subscription-graveyard", headers=H, timeout=30)
gv2 = r.json() if r.status_code == 200 else {}
hit2 = next((s for s in gv2.get("subscriptions", []) if s.get("id") == created_bill_id), None)
record("after toggle: is_buried True",
       hit2 is not None and hit2.get("is_buried") is True,
       f"is_buried={hit2.get('is_buried') if hit2 else None}")
record("after toggle: total_waste_monthly reflects +15.99",
       abs(gv2.get("total_waste_monthly", 0) - (baseline_waste_monthly + 15.99)) < 0.01,
       f"waste_now={gv2.get('total_waste_monthly')} baseline={baseline_waste_monthly}")

r = requests.patch(f"{API}/subscription-graveyard/{created_bill_id}/toggle-unused",
                   headers=H, timeout=30)
mu2 = r.json().get("marked_unused") if r.status_code == 200 else None
record("toggle #2 marked_unused False", mu2 is False, f"marked_unused={mu2}")


# Cleanup
r = requests.delete(f"{API}/bills/{created_bill_id}", headers=H, timeout=30)
print(f"[CLEANUP] delete bill status={r.status_code}")


# ────────────────────────────────────────────────────────────────
# 4) POST /api/future-self
# ────────────────────────────────────────────────────────────────
print("\n=== POST /api/future-self ===")
r = requests.post(f"{API}/future-self", timeout=30)
record("future-self no token → 401", r.status_code == 401, f"got {r.status_code}")

r = requests.post(f"{API}/future-self", headers=H, timeout=30)
record("future-self auth → 200", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    j = r.json()
    needed = {"currency", "current", "optimized", "assumptions"}
    record("future-self top-level keys",
           needed.issubset(j.keys()),
           f"keys={sorted(j.keys())}")
    assumptions = j.get("assumptions", {})
    arp = assumptions.get("annual_return_pct")
    record("assumptions.annual_return_pct == 7.0 (exact)",
           arp == 7.0,
           f"annual_return_pct={arp} type={type(arp).__name__}")
    record("assumptions.starting_balance present",
           "starting_balance" in assumptions,
           f"starting={assumptions.get('starting_balance')}")
    record("assumptions.optimization_source present",
           "optimization_source" in assumptions,
           f"src={assumptions.get('optimization_source')}")

    cur = j.get("current", {})
    opt = j.get("optimized", {})
    record("current has required keys",
           all(k in cur for k in ("monthly_savings", "monthly_spend", "projections")),
           f"keys={sorted(cur.keys())}")
    record("optimized has required keys",
           all(k in opt for k in ("monthly_savings", "monthly_spend", "monthly_freed", "projections")),
           f"keys={sorted(opt.keys())}")
    projs = cur.get("projections", [])
    record("current.projections has 4 entries",
           isinstance(projs, list) and len(projs) == 4,
           f"len={len(projs)}")
    if len(projs) == 4:
        years = [p.get("years") for p in projs]
        record("projections years == [5,10,20,30]",
               years == [5, 10, 20, 30],
               f"years={years}")
        balances = [p.get("balance") for p in projs]
        record("current projections strictly increase",
               all(balances[i] < balances[i+1] for i in range(3)),
               f"balances={balances}")
        ms = cur.get("monthly_savings", 0)
        print(f"[DATA] current.monthly_savings={ms}  current balances={balances}")
        if ms >= 4000:
            record("30yr balance substantial (>=$5M) at high monthly_savings (>=$4000/mo)",
                   balances[3] >= 5_000_000,
                   f"30yr={balances[3]} monthly_savings={ms}")
        else:
            print(f"[INFO] Skipping $5M+ check: monthly_savings={ms} < $4000 — not applicable to this user.")

    opt_projs = opt.get("projections", [])
    record("optimized.projections has 4 entries",
           isinstance(opt_projs, list) and len(opt_projs) == 4,
           f"len={len(opt_projs)}")
    if len(opt_projs) == 4:
        opt_balances = [p.get("balance") for p in opt_projs]
        record("optimized projections strictly increase",
               all(opt_balances[i] < opt_balances[i+1] for i in range(3)),
               f"balances={opt_balances}")


# ────────────────────────────────────────────────────────────────
# 5) AI Advisor FX context
# ────────────────────────────────────────────────────────────────
print("\n=== AI Advisor FX context ===")
payload = {"message": "how is USD to BRL today?", "language": "en"}
r = requests.post(f"{API}/ai-advisor/chat", headers=H, json=payload, timeout=120)
record("ai-advisor chat FX → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
if r.status_code == 200:
    reply = r.json().get("reply", "")
    print(f"[DATA] AI reply ({len(reply)} chars):\n{reply[:1000]}\n")
    numeric_matches = re.findall(r"\d+\.\d+", reply)
    record("AI reply mentions a numeric rate",
           len(numeric_matches) > 0,
           f"numbers_found={numeric_matches[:5]}")
    mentions_ecb = ("ECB" in reply or "Frankfurter" in reply or "frankfurter" in reply.lower())
    record("AI reply mentions ECB or Frankfurter",
           mentions_ecb,
           f"ECB_present={'ECB' in reply}  frankfurter_present={'frankfurter' in reply.lower()}")
    has_date = bool(re.search(r"\b\d{4}-\d{2}-\d{2}\b", reply)) or bool(
        re.search(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\b", reply, re.I)
    ) or bool(re.search(r"\b(today|yesterday|as of)\b", reply, re.I))
    record("AI reply mentions a date or 'as of/today'",
           has_date,
           f"has_date={has_date}")


# ────────────────────────────────────────────────────────────────
# 6) Regression smoke
# ────────────────────────────────────────────────────────────────
print("\n=== Regression smoke ===")
for path in ["/dashboard", "/insights", "/investments/rates", "/markets/fx"]:
    r = requests.get(f"{API}{path}", headers=H, timeout=60)
    record(f"GET {path} → 200", r.status_code == 200, f"status={r.status_code}")

r = requests.post(f"{API}/auth/login",
                  json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                  timeout=30)
record("POST /auth/login regression", r.status_code == 200, f"status={r.status_code}")


# ────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
print(f"TOTAL: {passed} PASS, {failed} FAIL out of {len(results)}")
if failed:
    print("\nFAILURES:")
    for name, ok, detail in results:
        if not ok:
            print(f"  - {name}: {detail}")
sys.exit(0 if failed == 0 else 1)
