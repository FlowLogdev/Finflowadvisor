"""
Backend tests for newly added LOCAL endpoints in /app/backend/server.py:
  - POST /api/export/file (csv, xlsx)
  - POST /api/support/ticket (public)
  - GET  /api/admin/support/tickets
  - POST /api/admin/support/tickets/{ticket_number}/reply
  - POST /api/admin/support/tickets/{ticket_number}/close

Plus smoke tests on /api/auth/login and /api/dashboard.
"""
import base64
import uuid
import sys
import requests

BASE = "https://cashflow-staging-4.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@finflow.com"
ADMIN_PASSWORD = "eWcukKTEp0WMtHyaoT8ovZt0"

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    marker = "PASS" if ok else "FAIL"
    print(f"[{marker}] {name} — {detail}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    try:
        admin_tok = login(ADMIN_EMAIL, ADMIN_PASSWORD)
        record("smoke.auth.login(admin)", True, "token acquired")
    except Exception as e:
        record("smoke.auth.login(admin)", False, f"{e}")
        return

    # smoke dashboard
    try:
        r = requests.get(f"{BASE}/dashboard", headers=hdr(admin_tok), timeout=20)
        ok = r.status_code == 200 and "settings" in r.json()
        record("smoke.dashboard", ok, f"status={r.status_code}")
    except Exception as e:
        record("smoke.dashboard", False, str(e))

    # register fresh user
    email_rand = f"realuser_{uuid.uuid4().hex[:8]}@example.com"
    user_tok = None
    try:
        r = requests.post(f"{BASE}/auth/register", json={
            "name": "Alex Morgan",
            "email": email_rand,
            "password": "S3cureP@ss!",
        }, timeout=20)
        ok = r.status_code == 200 and "access_token" in r.json()
        user_tok = r.json()["access_token"] if ok else None
        record("setup.auth.register(user)", ok, f"status={r.status_code}")
    except Exception as e:
        record("setup.auth.register(user)", False, str(e))

    if user_tok:
        try:
            requests.post(f"{BASE}/bills", headers=hdr(user_tok), json={
                "name": "Rent", "category": "Housing", "amount": 1200, "dueDay": 1
            }, timeout=20)
            requests.post(f"{BASE}/expenses", headers=hdr(user_tok), json={
                "name": "Starbucks", "category": "Dining", "amount": 7.5, "date": "2026-04-20", "recurring": False
            }, timeout=20)
        except Exception:
            pass

    # 1) /export/file
    try:
        r = requests.post(f"{BASE}/export/file", json={"format": "csv"}, timeout=20)
        record("export.file.no_auth_401", r.status_code == 401, f"status={r.status_code}")
    except Exception as e:
        record("export.file.no_auth_401", False, str(e))

    try:
        r = requests.post(f"{BASE}/export/file", headers=hdr(user_tok or admin_tok),
                          json={"format": "csv"}, timeout=30)
        j = r.json() if r.status_code == 200 else {}
        required = {"filename", "mime", "base64_data", "bills_count", "expenses_count"}
        has_keys = required.issubset(j.keys()) if isinstance(j, dict) else False
        decoded = b""
        b64_ok = False
        header_ok = False
        non_empty = False
        if has_keys:
            try:
                decoded = base64.b64decode(j["base64_data"])
                b64_ok = True
                non_empty = len(decoded) > 0
                first_line = decoded.splitlines()[0].decode("utf-8", errors="replace") if decoded else ""
                header_ok = first_line.strip() == "Type,Name,Category,Amount,Date/DueDay,Recurring"
            except Exception:
                pass
        ok = (r.status_code == 200 and has_keys and b64_ok and non_empty and header_ok
              and j.get("mime") == "text/csv" and j.get("filename", "").endswith(".csv"))
        record("export.file.csv", ok,
               f"status={r.status_code} keys={has_keys} b64_ok={b64_ok} non_empty={non_empty} header_ok={header_ok} mime={j.get('mime')} fname={j.get('filename')} bytes={len(decoded)}")
    except Exception as e:
        record("export.file.csv", False, str(e))

    try:
        r = requests.post(f"{BASE}/export/file", headers=hdr(user_tok or admin_tok),
                          json={"format": "xlsx"}, timeout=30)
        j = r.json() if r.status_code == 200 else {}
        required = {"filename", "mime", "base64_data", "bills_count", "expenses_count"}
        has_keys = required.issubset(j.keys()) if isinstance(j, dict) else False
        decoded = b""
        pk_ok = False
        if has_keys:
            try:
                decoded = base64.b64decode(j["base64_data"])
                pk_ok = decoded[:2] == b"PK"
            except Exception:
                pass
        ok = (r.status_code == 200 and has_keys and pk_ok
              and j.get("filename", "").endswith(".xlsx")
              and "spreadsheetml" in (j.get("mime") or ""))
        record("export.file.xlsx", ok,
               f"status={r.status_code} keys={has_keys} PK={pk_ok} mime={j.get('mime')} fname={j.get('filename')} bytes={len(decoded)}")
    except Exception as e:
        record("export.file.xlsx", False, str(e))

    try:
        r = requests.post(f"{BASE}/export/file", headers=hdr(user_tok or admin_tok),
                          json={"format": "pdf"}, timeout=20)
        record("export.file.bad_format_400", r.status_code == 400, f"status={r.status_code}")
    except Exception as e:
        record("export.file.bad_format_400", False, str(e))

    # 2) /support/ticket
    ticket_number = None
    try:
        r = requests.post(f"{BASE}/support/ticket", json={
            "name": "Jordan Rivera",
            "email": "jordan.rivera@example.com",
            "phone": "",
            "description": "I can't see my bills on the dashboard after login."
        }, timeout=20)
        j = r.json() if r.status_code == 200 else {}
        tnum = j.get("ticket_number", "") if isinstance(j, dict) else ""
        pattern_ok = isinstance(tnum, str) and tnum.startswith("FF-") and len(tnum) == 9
        status_ok = j.get("status") == "open"
        created_ok = bool(j.get("created_at"))
        ok = r.status_code == 200 and pattern_ok and status_ok and created_ok
        if ok:
            ticket_number = tnum
        record("support.ticket.create", ok,
               f"status={r.status_code} tnum={tnum} open={status_ok} created={created_ok}")
    except Exception as e:
        record("support.ticket.create", False, str(e))

    for label, body in [
        ("empty_name", {"name": "", "email": "a@b.com", "phone": "", "description": "hi"}),
        ("empty_email", {"name": "X", "email": "", "phone": "", "description": "hi"}),
        ("empty_desc", {"name": "X", "email": "a@b.com", "phone": "", "description": ""}),
    ]:
        try:
            r = requests.post(f"{BASE}/support/ticket", json=body, timeout=20)
            record(f"support.ticket.{label}_400", r.status_code == 400, f"status={r.status_code}")
        except Exception as e:
            record(f"support.ticket.{label}_400", False, str(e))

    # 3) GET /admin/support/tickets
    try:
        r = requests.get(f"{BASE}/admin/support/tickets", timeout=20)
        record("admin.tickets.list.no_auth_401", r.status_code == 401, f"status={r.status_code}")
    except Exception as e:
        record("admin.tickets.list.no_auth_401", False, str(e))

    if user_tok:
        try:
            r = requests.get(f"{BASE}/admin/support/tickets", headers=hdr(user_tok), timeout=20)
            record("admin.tickets.list.non_admin_403", r.status_code == 403, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.list.non_admin_403", False, str(e))

    try:
        r = requests.get(f"{BASE}/admin/support/tickets", headers=hdr(admin_tok), timeout=20)
        j = r.json() if r.status_code == 200 else {}
        has_tickets = isinstance(j.get("tickets"), list)
        contains_new = any(t.get("ticket_number") == ticket_number for t in (j.get("tickets") or [])) if ticket_number else True
        record("admin.tickets.list.admin_ok", r.status_code == 200 and has_tickets and contains_new,
               f"status={r.status_code} count={len(j.get('tickets') or [])} contains_created={contains_new}")
    except Exception as e:
        record("admin.tickets.list.admin_ok", False, str(e))

    try:
        r = requests.get(f"{BASE}/admin/support/tickets?status=open", headers=hdr(admin_tok), timeout=20)
        j = r.json() if r.status_code == 200 else {}
        tickets = j.get("tickets") or []
        all_open = all(t.get("status") == "open" for t in tickets)
        contains_new = any(t.get("ticket_number") == ticket_number for t in tickets) if ticket_number else True
        record("admin.tickets.list.filter_open", r.status_code == 200 and all_open and contains_new,
               f"status={r.status_code} count={len(tickets)} all_open={all_open} contains_new={contains_new}")
    except Exception as e:
        record("admin.tickets.list.filter_open", False, str(e))

    # 4) /reply
    if ticket_number:
        try:
            r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/reply",
                              json={"message": "hi"}, timeout=20)
            record("admin.tickets.reply.no_auth_401", r.status_code == 401, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.reply.no_auth_401", False, str(e))

        if user_tok:
            try:
                r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/reply",
                                  headers=hdr(user_tok), json={"message": "hi"}, timeout=20)
                record("admin.tickets.reply.non_admin_403", r.status_code == 403, f"status={r.status_code}")
            except Exception as e:
                record("admin.tickets.reply.non_admin_403", False, str(e))

        reply_msg = "We're working on it — will update you shortly."
        try:
            r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/reply",
                              headers=hdr(admin_tok), json={"message": reply_msg}, timeout=20)
            ok = r.status_code == 200 and r.json().get("ok") is True
            record("admin.tickets.reply.admin_ok", ok, f"status={r.status_code} body={r.text[:120]}")
        except Exception as e:
            record("admin.tickets.reply.admin_ok", False, str(e))

        try:
            r = requests.get(f"{BASE}/admin/support/tickets", headers=hdr(admin_tok), timeout=20)
            j = r.json()
            target = next((t for t in j.get("tickets", []) if t.get("ticket_number") == ticket_number), None)
            status_ok = bool(target) and target.get("status") == "replied"
            reply_stored = bool(target) and any(rep.get("message") == reply_msg for rep in (target.get("replies") or []))
            record("admin.tickets.reply.state_updated", status_ok and reply_stored,
                   f"found={bool(target)} status={target.get('status') if target else None} reply_stored={reply_stored}")
        except Exception as e:
            record("admin.tickets.reply.state_updated", False, str(e))

        try:
            r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/reply",
                              headers=hdr(admin_tok), json={"message": "  "}, timeout=20)
            record("admin.tickets.reply.empty_400", r.status_code == 400, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.reply.empty_400", False, str(e))

        try:
            r = requests.post(f"{BASE}/admin/support/tickets/FF-NOPE00/reply",
                              headers=hdr(admin_tok), json={"message": "x"}, timeout=20)
            record("admin.tickets.reply.not_found_404", r.status_code == 404, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.reply.not_found_404", False, str(e))

        # 5) /close
        try:
            r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/close", timeout=20)
            record("admin.tickets.close.no_auth_401", r.status_code == 401, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.close.no_auth_401", False, str(e))

        if user_tok:
            try:
                r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/close",
                                  headers=hdr(user_tok), timeout=20)
                record("admin.tickets.close.non_admin_403", r.status_code == 403, f"status={r.status_code}")
            except Exception as e:
                record("admin.tickets.close.non_admin_403", False, str(e))

        try:
            r = requests.post(f"{BASE}/admin/support/tickets/{ticket_number}/close",
                              headers=hdr(admin_tok), timeout=20)
            ok = r.status_code == 200 and r.json().get("ok") is True
            record("admin.tickets.close.admin_ok", ok, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.close.admin_ok", False, str(e))

        try:
            r = requests.get(f"{BASE}/admin/support/tickets?status=closed", headers=hdr(admin_tok), timeout=20)
            j = r.json()
            found = any(t.get("ticket_number") == ticket_number and t.get("status") == "closed"
                        for t in j.get("tickets", []))
            record("admin.tickets.close.state_closed", found, f"found_in_closed_list={found}")
        except Exception as e:
            record("admin.tickets.close.state_closed", False, str(e))

        try:
            r = requests.post(f"{BASE}/admin/support/tickets/FF-DOES00/close",
                              headers=hdr(admin_tok), timeout=20)
            record("admin.tickets.close.not_found_404", r.status_code == 404, f"status={r.status_code}")
        except Exception as e:
            record("admin.tickets.close.not_found_404", False, str(e))

    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(n, d) for n, ok, d in results if not ok]
    print("\n=============================================")
    print(f"TOTAL: {len(results)}  PASS: {passed}  FAIL: {len(failed)}")
    if failed:
        print("Failures:")
        for n, d in failed:
            print(f"  - {n}: {d}")
    print("=============================================")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
