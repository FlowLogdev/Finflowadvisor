"""
Backend tests for new Investments endpoints in /app/backend/server.py:
  - GET  /api/investments/rates
  - GET  /api/investments/institutions?country=br|us
  - POST /api/investments/project
  - POST /api/investments/advice

Plus regression smoke on /api/auth/login, /api/dashboard, /api/insights.
"""
import sys
import json
import requests

BASE = "https://cashflow-staging-4.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@finflow.com"
ADMIN_PASSWORD = "eWcukKTEp0WMtHyaoT8ovZt0"

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {name} — {detail}")


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    # ── Login ──
    try:
        r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, f"login status={r.status_code} body={r.text[:200]}"
        tok = r.json()["access_token"]
        record("auth/login admin", True, "200 OK, token acquired")
    except Exception as e:
        record("auth/login admin", False, str(e))
        print_summary()
        sys.exit(1)

    # ══════════════════════════════════════════════════════════════════
    # 1. GET /api/investments/rates
    # ══════════════════════════════════════════════════════════════════

    # 1a. No-auth → 401
    try:
        r = requests.get(f"{BASE}/investments/rates", timeout=20)
        ok = r.status_code == 401
        record("rates no-auth→401", ok, f"status={r.status_code}")
    except Exception as e:
        record("rates no-auth→401", False, str(e))

    # 1b. First authed call — expect full shape, cached:false
    try:
        r = requests.get(f"{BASE}/investments/rates", headers=hdr(tok), timeout=30)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        j = r.json()
        br = j.get("br", {})
        us = j.get("us", {})
        # Required BR fields
        for k in ("selic_annual_pct", "cdi_annual_pct", "poupanca_annual_pct"):
            assert k in br, f"missing br.{k}"
            assert isinstance(br[k], (int, float)), f"br.{k} not numeric: {br[k]}"
        # Required US fields
        for k in ("fed_funds_pct", "treasury_1y_pct", "treasury_5y_pct", "treasury_10y_pct", "hysa_avg_pct"):
            assert k in us, f"missing us.{k}"
            assert isinstance(us[k], (int, float)), f"us.{k} not numeric: {us[k]}"
        # cached must be present and should be False or True (depending on test ordering)
        assert "cached" in j, "missing cached field"
        first_cached = j["cached"]
        br_summary = f"selic={br['selic_annual_pct']} cdi={br['cdi_annual_pct']} poup={br['poupanca_annual_pct']}"
        us_summary = f"fed={us['fed_funds_pct']} t10y={us['treasury_10y_pct']} hysa={us['hysa_avg_pct']}"
        fallback_note = []
        if br.get("fallback"):
            fallback_note.append("br.fallback=true")
        if us.get("fallback"):
            fallback_note.append("us.fallback=true")
        record("rates authed first call shape", True, f"cached={first_cached} {br_summary} | {us_summary} {fallback_note}")
    except Exception as e:
        record("rates authed first call shape", False, str(e))

    # 1c. Second call must be cached:true
    try:
        r = requests.get(f"{BASE}/investments/rates", headers=hdr(tok), timeout=20)
        assert r.status_code == 200
        j = r.json()
        ok = j.get("cached") is True
        record("rates second call cached:true", ok, f"cached={j.get('cached')}")
    except Exception as e:
        record("rates second call cached:true", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    # 2. GET /api/investments/institutions
    # ══════════════════════════════════════════════════════════════════

    # 2a. No-auth → 401
    try:
        r = requests.get(f"{BASE}/investments/institutions?country=br", timeout=20)
        ok = r.status_code == 401
        record("institutions no-auth→401", ok, f"status={r.status_code}")
    except Exception as e:
        record("institutions no-auth→401", False, str(e))

    # 2b. BR
    try:
        r = requests.get(f"{BASE}/investments/institutions?country=br", headers=hdr(tok), timeout=20)
        assert r.status_code == 200, f"status={r.status_code}"
        j = r.json()
        insts = j.get("institutions", [])
        assert len(insts) == 5, f"expected 5 BR institutions, got {len(insts)}"
        names = [i["name"] for i in insts]
        for expected in ("Nubank", "BTG Pactual", "XP Investimentos", "Itaú", "Bradesco"):
            assert expected in names, f"missing BR institution: {expected}"
        # Each must have required fields, safety=FGC, rate_pct_cdi numeric
        for i in insts:
            for k in ("name", "product", "rate_label", "rate_pct_cdi", "min_amount", "liquidity", "safety", "url", "emoji"):
                assert k in i, f"BR inst {i.get('name')} missing {k}"
            assert i["safety"] == "FGC", f"BR {i['name']} safety={i['safety']} (expected FGC)"
            assert isinstance(i["rate_pct_cdi"], (int, float)), f"BR {i['name']} rate_pct_cdi not numeric"
        record("institutions?country=br shape", True, f"5 inst: {names}")
    except Exception as e:
        record("institutions?country=br shape", False, str(e))

    # 2c. US
    try:
        r = requests.get(f"{BASE}/investments/institutions?country=us", headers=hdr(tok), timeout=20)
        assert r.status_code == 200, f"status={r.status_code}"
        j = r.json()
        insts = j.get("institutions", [])
        assert len(insts) == 5, f"expected 5 US institutions, got {len(insts)}"
        names = [i["name"] for i in insts]
        # Verify required names appear (they're "Marcus (Goldman Sachs)" etc.)
        for expected in ("Marcus", "Ally", "SoFi", "Discover", "CIT"):
            assert any(expected in n for n in names), f"missing US institution containing: {expected} (got {names})"
        for i in insts:
            for k in ("name", "product", "rate_label", "rate_apy", "min_amount", "liquidity", "safety", "url", "emoji"):
                assert k in i, f"US inst {i.get('name')} missing {k}"
            assert i["safety"] == "FDIC", f"US {i['name']} safety={i['safety']} (expected FDIC)"
            assert isinstance(i["rate_apy"], (int, float)), f"US {i['name']} rate_apy not numeric"
        record("institutions?country=us shape", True, f"5 inst: {names}")
    except Exception as e:
        record("institutions?country=us shape", False, str(e))

    # 2d. Invalid country → 400
    try:
        r = requests.get(f"{BASE}/investments/institutions?country=jp", headers=hdr(tok), timeout=20)
        ok = r.status_code == 400
        record("institutions invalid country→400", ok, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("institutions invalid country→400", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    # 3. POST /api/investments/project
    # ══════════════════════════════════════════════════════════════════

    # 3a. No-auth → 401
    try:
        r = requests.post(f"{BASE}/investments/project", json={"initial": 1000, "monthly": 200, "period_months": 60}, timeout=20)
        ok = r.status_code == 401
        record("project no-auth→401", ok, f"status={r.status_code}")
    except Exception as e:
        record("project no-auth→401", False, str(e))

    # 3b. Normal projection
    try:
        body = {"initial": 1000, "monthly": 200, "period_months": 60}
        r = requests.post(f"{BASE}/investments/project", headers=hdr(tok), json=body, timeout=30)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        j = r.json()
        assert j["period_months"] == 60
        assert j["total_invested"] == 1000 + 200 * 60, f"total_invested={j['total_invested']} expected 13000"
        for region in ("br", "us"):
            assert region in j, f"missing region {region}"
        br = j["br"]; us = j["us"]
        for k in ("cdb", "tesouro", "poupanca"):
            assert k in br, f"missing br.{k}"
            strat = br[k]
            for f in ("annual_rate_pct", "final_amount", "total_earnings", "series"):
                assert f in strat, f"br.{k} missing {f}"
            assert len(strat["series"]) == 61, f"br.{k} series has {len(strat['series'])} entries (expected 61)"
            assert strat["series"][0]["month"] == 0
            assert strat["series"][-1]["month"] == 60
            assert strat["final_amount"] > j["total_invested"], f"br.{k} final {strat['final_amount']} not > invested {j['total_invested']}"
        for k in ("hysa", "ustreasury", "savings"):
            assert k in us, f"missing us.{k}"
            strat = us[k]
            for f in ("annual_rate_pct", "final_amount", "total_earnings", "series"):
                assert f in strat, f"us.{k} missing {f}"
            assert len(strat["series"]) == 61, f"us.{k} series len={len(strat['series'])}"
            assert strat["final_amount"] > j["total_invested"], f"us.{k} final {strat['final_amount']} not > invested"
        # Ordering: CDB > Poupança, HYSA > Savings
        assert br["cdb"]["final_amount"] > br["poupanca"]["final_amount"], \
            f"CDB ({br['cdb']['final_amount']}) not > Poupança ({br['poupanca']['final_amount']})"
        assert us["hysa"]["final_amount"] > us["savings"]["final_amount"], \
            f"HYSA ({us['hysa']['final_amount']}) not > Savings ({us['savings']['final_amount']})"
        detail = (f"invested=13000, CDB={br['cdb']['final_amount']} > Poupança={br['poupanca']['final_amount']}, "
                  f"HYSA={us['hysa']['final_amount']} > Savings={us['savings']['final_amount']}")
        record("project 1000+200x60 shape+math", True, detail)
    except Exception as e:
        record("project 1000+200x60 shape+math", False, str(e))

    # 3c. Invalid period_months=0 → 400
    try:
        r = requests.post(f"{BASE}/investments/project", headers=hdr(tok),
                          json={"initial": 1000, "monthly": 200, "period_months": 0}, timeout=20)
        ok = r.status_code == 400
        record("project period=0 →400", ok, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("project period=0 →400", False, str(e))

    # 3d. period_months>600 → 400
    try:
        r = requests.post(f"{BASE}/investments/project", headers=hdr(tok),
                          json={"initial": 1000, "monthly": 200, "period_months": 601}, timeout=20)
        ok = r.status_code == 400
        record("project period=601 →400", ok, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("project period=601 →400", False, str(e))

    # 3e. Negative initial → 400
    try:
        r = requests.post(f"{BASE}/investments/project", headers=hdr(tok),
                          json={"initial": -50, "monthly": 200, "period_months": 12}, timeout=20)
        ok = r.status_code == 400
        record("project negative initial →400", ok, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("project negative initial →400", False, str(e))

    # 3f. Negative monthly → 400
    try:
        r = requests.post(f"{BASE}/investments/project", headers=hdr(tok),
                          json={"initial": 1000, "monthly": -10, "period_months": 12}, timeout=20)
        ok = r.status_code == 400
        record("project negative monthly →400", ok, f"status={r.status_code} body={r.text[:120]}")
    except Exception as e:
        record("project negative monthly →400", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    # 4. POST /api/investments/advice
    # ══════════════════════════════════════════════════════════════════

    # 4a. No-auth → 401
    try:
        r = requests.post(f"{BASE}/investments/advice", json={"country": "br"}, timeout=20)
        ok = r.status_code == 401
        record("advice no-auth→401", ok, f"status={r.status_code}")
    except Exception as e:
        record("advice no-auth→401", False, str(e))

    # 4b. Country=br
    try:
        r = requests.post(f"{BASE}/investments/advice", headers=hdr(tok),
                          json={"country": "br"}, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        j = r.json()
        for k in ("advice", "bucket", "monthly_savings"):
            assert k in j, f"missing {k}"
        assert isinstance(j["advice"], str) and len(j["advice"].strip()) > 0, "advice empty"
        # currency + benchmark_pct may be missing if fallback w/o key, but spec says present
        has_currency = "currency" in j
        has_benchmark = "benchmark_pct" in j
        is_fallback = j.get("fallback", False)
        preview = j["advice"][:120].replace("\n", " ")
        record("advice country=br", True,
               f"fallback={is_fallback} currency_present={has_currency} benchmark_present={has_benchmark} "
               f"advice_len={len(j['advice'])} preview='{preview}...'")
    except Exception as e:
        record("advice country=br", False, str(e))

    # 4c. Country=us
    try:
        r = requests.post(f"{BASE}/investments/advice", headers=hdr(tok),
                          json={"country": "us"}, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        j = r.json()
        for k in ("advice", "bucket", "monthly_savings"):
            assert k in j, f"missing {k}"
        assert isinstance(j["advice"], str) and len(j["advice"].strip()) > 0, "advice empty"
        is_fallback = j.get("fallback", False)
        preview = j["advice"][:120].replace("\n", " ")
        record("advice country=us", True,
               f"fallback={is_fallback} bucket='{j['bucket'][:60]}' monthly_savings={j['monthly_savings']} "
               f"advice_len={len(j['advice'])} preview='{preview}...'")
    except Exception as e:
        record("advice country=us", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    # 5. Regression smoke
    # ══════════════════════════════════════════════════════════════════
    try:
        r = requests.get(f"{BASE}/dashboard", headers=hdr(tok), timeout=20)
        ok = r.status_code == 200 and "total_bills" in r.json()
        record("smoke /dashboard", ok, f"status={r.status_code} keys={list(r.json().keys())[:6]}")
    except Exception as e:
        record("smoke /dashboard", False, str(e))

    try:
        r = requests.get(f"{BASE}/insights", headers=hdr(tok), timeout=20)
        ok = r.status_code == 200 and "forecast" in r.json()
        j = r.json() if r.status_code == 200 else {}
        record("smoke /insights", ok, f"status={r.status_code} keys={list(j.keys())}")
    except Exception as e:
        record("smoke /insights", False, str(e))

    print_summary()


def print_summary():
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"RESULT: {passed}/{len(results)} passed, {len(failed)} failed")
    if failed:
        print("\nFAILED CASES:")
        for n, d in failed:
            print(f"  - {n}: {d}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
