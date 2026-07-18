from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os, logging, uuid, bcrypt, jwt, time, asyncio
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ── Auth Helpers ────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_access_token(uid: str, email: str) -> str:
    return jwt.encode({"sub": uid, "email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=24), "type": "access"}, JWT_SECRET, algorithm=JWT_ALG)

def create_refresh_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (jwt.InvalidTokenError, Exception):
        raise HTTPException(status_code=401, detail="Invalid token")

# ── Auth Models ─────────────────────────────────────────────────────

class RegisterInput(BaseModel):
    name: str
    email: str
    password: str

class LoginInput(BaseModel):
    email: str
    password: str

# ── Auth Endpoints ──────────────────────────────────────────────────

@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "name": data.name.strip(), "email": email,
        "password_hash": hash_password(data.password),
        "role": "user", "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    uid = str(result.inserted_id)
    # create default settings for new user
    await db.settings.insert_one({"user_id": uid, "salary": 5000, "currency": "$", "pctNeeds": 50, "pctWants": 30, "pctSavings": 20})
    at = create_access_token(uid, email)
    rt = create_refresh_token(uid)
    return {"user": {"id": uid, "name": data.name.strip(), "email": email, "role": "user"}, "access_token": at, "refresh_token": rt}

@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    at = create_access_token(uid, email)
    rt = create_refresh_token(uid)
    return {"user": {"id": uid, "name": user["name"], "email": email, "role": user.get("role", "user")}, "access_token": at, "refresh_token": rt}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"id": user["_id"], "name": user["name"], "email": user["email"], "role": user.get("role", "user")}

@api_router.post("/auth/refresh")
async def refresh_token(request: Request):
    token = request.cookies.get("refresh_token")
    if not token:
        body = await request.json()
        token = body.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        uid = str(user["_id"])
        at = create_access_token(uid, user["email"])
        return {"access_token": at}
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    collections = ["settings", "bills", "expenses", "savings_goals",
                   "ai_messages", "ai_insights", "watchlist", "support_tickets"]
    for col in collections:
        await db[col].delete_many({"user_id": uid})
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"success": True}

# ── Data Models ─────────────────────────────────────────────────────

class Settings(BaseModel):
    salary: float = 5000
    currency: str = "$"
    pctNeeds: float = 50
    pctWants: float = 30
    pctSavings: float = 20

class BillCreate(BaseModel):
    name: str
    category: str
    amount: float
    dueDay: Optional[int] = None

class ExpenseCreate(BaseModel):
    name: str
    category: str
    amount: float
    date: Optional[str] = None
    recurring: bool = False

class SavingsGoalCreate(BaseModel):
    name: str
    target: float
    saved: float = 0

class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target: Optional[float] = None
    saved: Optional[float] = None

# ── Settings ────────────────────────────────────────────────────────

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"user_id": user["_id"]}, {"_id": 0, "user_id": 0})
    if not s:
        default = Settings().model_dump()
        await db.settings.insert_one({**default, "user_id": user["_id"]})
        return default
    return s

@api_router.put("/settings")
async def update_settings(data: Settings, user: dict = Depends(get_current_user)):
    d = data.model_dump()
    await db.settings.update_one({"user_id": user["_id"]}, {"$set": d}, upsert=True)
    return d

# ── Bills ───────────────────────────────────────────────────────────

@api_router.get("/bills")
async def get_bills(user: dict = Depends(get_current_user)):
    return await db.bills.find({"user_id": user["_id"]}, {"_id": 0, "user_id": 0}).to_list(1000)

@api_router.post("/bills")
async def create_bill(data: BillCreate, user: dict = Depends(get_current_user)):
    d = {"id": str(uuid.uuid4()), **data.model_dump(), "user_id": user["_id"]}
    await db.bills.insert_one(d.copy())
    d.pop("user_id", None)
    d.pop("_id", None)
    return d

@api_router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
    r = await db.bills.delete_one({"id": bill_id, "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
    return {"deleted": True}

# ── Expenses ────────────────────────────────────────────────────────

@api_router.get("/expenses")
async def get_expenses(user: dict = Depends(get_current_user)):
    return await db.expenses.find({"user_id": user["_id"]}, {"_id": 0, "user_id": 0}).to_list(1000)

@api_router.post("/expenses")
async def create_expense(data: ExpenseCreate, user: dict = Depends(get_current_user)):
    d = data.model_dump()
    if not d.get("date"):
        d["date"] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    d["id"] = str(uuid.uuid4())
    d["user_id"] = user["_id"]
    await db.expenses.insert_one(d.copy())
    d.pop("user_id", None)
    d.pop("_id", None)
    return d

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    r = await db.expenses.delete_one({"id": expense_id, "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"deleted": True}

@api_router.patch("/expenses/{expense_id}/toggle-recurring")
async def toggle_recurring(expense_id: str, user: dict = Depends(get_current_user)):
    exp = await db.expenses.find_one({"id": expense_id, "user_id": user["_id"]}, {"_id": 0, "user_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    new_val = not exp.get("recurring", False)
    await db.expenses.update_one({"id": expense_id, "user_id": user["_id"]}, {"$set": {"recurring": new_val}})
    exp["recurring"] = new_val
    return exp

# ── Savings Goals ───────────────────────────────────────────────────

@api_router.get("/savings-goals")
async def get_savings_goals(user: dict = Depends(get_current_user)):
    return await db.savings_goals.find({"user_id": user["_id"]}, {"_id": 0, "user_id": 0}).to_list(1000)

@api_router.post("/savings-goals")
async def create_savings_goal(data: SavingsGoalCreate, user: dict = Depends(get_current_user)):
    d = {"id": str(uuid.uuid4()), **data.model_dump(), "user_id": user["_id"]}
    await db.savings_goals.insert_one(d.copy())
    d.pop("user_id", None)
    d.pop("_id", None)
    return d

@api_router.put("/savings-goals/{goal_id}")
async def update_savings_goal(goal_id: str, data: SavingsGoalUpdate, user: dict = Depends(get_current_user)):
    ud = {k: v for k, v in data.model_dump().items() if v is not None}
    if not ud:
        raise HTTPException(status_code=400, detail="No data")
    r = await db.savings_goals.update_one({"id": goal_id, "user_id": user["_id"]}, {"$set": ud})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    g = await db.savings_goals.find_one({"id": goal_id}, {"_id": 0, "user_id": 0})
    return g

@api_router.delete("/savings-goals/{goal_id}")
async def delete_savings_goal(goal_id: str, user: dict = Depends(get_current_user)):
    r = await db.savings_goals.delete_one({"id": goal_id, "user_id": user["_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}

# ── Dashboard ───────────────────────────────────────────────────────

BILL_CAT_COLORS = {'Housing':'#4A90D9','Utilities':'#F5A623','Food':'#7B68EE','Transport':'#50C878','Health':'#FF6B6B','Insurance':'#1A4A8A','Subscriptions':'#9B59B6','Education':'#3498DB','Other':'#95A5A6'}
EXP_CAT_COLORS = {'Dining':'#FF6B6B','Groceries':'#50C878','Shopping':'#9B59B6','Transport':'#F5A623','Entertainment':'#FF69B4','Health':'#3498DB','Travel':'#1ABC9C','Personal care':'#E67E22','Gifts':'#E74C3C','Other':'#95A5A6'}

@api_router.get("/dashboard")
async def get_dashboard(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})
    if not settings:
        settings = Settings().model_dump()
    bills = await db.bills.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    goals = await db.savings_goals.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)

    tb = sum(b["amount"] for b in bills)
    te = sum(e["amount"] for e in expenses)
    sal = settings.get("salary", 0)
    net = sal - tb - te

    bc: dict = {}
    for b in bills: bc[b["category"]] = bc.get(b["category"], 0) + b["amount"]
    ec: dict = {}
    for e in expenses: ec[e["category"]] = ec.get(e["category"], 0) + e["amount"]

    pn, pw, ps = settings.get("pctNeeds", 50), settings.get("pctWants", 30), settings.get("pctSavings", 20)

    if sal == 0: tip = "Set up your salary in Setup to get started!"
    elif net < 0: tip = "You're overspending! Review bills and expenses."
    elif tb > sal * 0.5: tip = "Bills exceed 50% of income. Look for ways to cut."
    elif te > sal * 0.3: tip = "Discretionary spending above 30%. Consider the 50/30/20 rule."
    elif len(bills) == 0 and len(expenses) == 0: tip = "Add bills and expenses to see your financial picture."
    else: tip = "You're managing well! Keep tracking."

    return {
        "settings": settings, "total_bills": tb, "total_expenses": te, "net_remaining": net,
        "bills_by_category": [{"name": k, "amount": v, "color": BILL_CAT_COLORS.get(k, '#95A5A6')} for k, v in bc.items()],
        "expenses_by_category": [{"name": k, "amount": v, "color": EXP_CAT_COLORS.get(k, '#95A5A6')} for k, v in ec.items()],
        "budget_comparison": {"needs": {"target": sal*pn/100, "actual": tb}, "wants": {"target": sal*pw/100, "actual": te}, "savings": {"target": sal*ps/100, "actual": max(net, 0)}},
        "smart_tip": tip, "savings_goals": goals,
        "all_spending": sorted([{"name": b["name"], "category": b["category"], "amount": b["amount"], "type": "bill"} for b in bills] + [{"name": e["name"], "category": e["category"], "amount": e["amount"], "type": "expense"} for e in expenses], key=lambda x: x["amount"], reverse=True),
        "cashflow": {"income": sal, "bills": tb, "expenses": te, "net": net},
    }

# ── Monthly History ─────────────────────────────────────────────────

@api_router.get("/monthly-history")
async def get_monthly_history(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})
    sal = settings.get("salary", 0) if settings else 0
    cur = settings.get("currency", "$") if settings else "$"
    bills = await db.bills.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    tb = sum(b["amount"] for b in bills)
    months: dict = {}
    for e in expenses:
        m = e["date"][:7]
        if m not in months: months[m] = {"total": 0, "count": 0}
        months[m]["total"] += e["amount"]; months[m]["count"] += 1
    cur_m = datetime.now(timezone.utc).strftime('%Y-%m')
    if cur_m not in months: months[cur_m] = {"total": 0, "count": 0}
    return [{"month": m, "salary": sal, "currency": cur, "bills": tb, "expenses": d["total"], "expense_count": d["count"], "net": sal - tb - d["total"]} for m, d in sorted(months.items(), reverse=True)]

@api_router.get("/monthly-detail/{month}")
async def get_monthly_detail(month: str, user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})
    sal = settings.get("salary", 0) if settings else 0
    cur = settings.get("currency", "$") if settings else "$"
    bills = await db.bills.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid, "date": {"$regex": f"^{month}"}}, {"_id": 0, "user_id": 0}).to_list(1000)
    tb = sum(b["amount"] for b in bills)
    te = sum(e["amount"] for e in expenses)
    ec: dict = {}
    for e in expenses: ec[e["category"]] = ec.get(e["category"], 0) + e["amount"]
    blc: dict = {}
    for b in bills: blc[b["category"]] = blc.get(b["category"], 0) + b["amount"]
    return {"month": month, "salary": sal, "currency": cur, "total_bills": tb, "total_expenses": te, "net": sal-tb-te, "expenses": expenses, "bills": bills, "expenses_by_category": [{"name": k, "amount": v} for k, v in ec.items()], "bills_by_category": [{"name": k, "amount": v} for k, v in blc.items()]}

# ── Recurring & Reset ───────────────────────────────────────────────

@api_router.post("/process-recurring")
async def process_recurring(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    cm = datetime.now(timezone.utc).strftime('%Y-%m')
    s = await db.settings.find_one({"user_id": uid})
    if s and s.get("lastRecurringMonth") == cm:
        return {"processed": False, "created": 0}
    recs = await db.expenses.find({"user_id": uid, "recurring": True}, {"_id": 0}).to_list(1000)
    nd = datetime.now(timezone.utc).strftime('%Y-%m-01')
    created = 0
    for exp in recs:
        exists = await db.expenses.find_one({"user_id": uid, "name": exp["name"], "category": exp["category"], "recurring": True, "date": {"$regex": f"^{cm}"}})
        if exists: continue
        d = {"id": str(uuid.uuid4()), "name": exp["name"], "category": exp["category"], "amount": exp["amount"], "date": nd, "recurring": True, "user_id": uid}
        await db.expenses.insert_one(d.copy()); created += 1
    await db.settings.update_one({"user_id": uid}, {"$set": {"lastRecurringMonth": cm}}, upsert=True)
    return {"processed": True, "created": created}

@api_router.post("/reset")
async def reset_all_data(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    await db.settings.delete_many({"user_id": uid})
    await db.bills.delete_many({"user_id": uid})
    await db.expenses.delete_many({"user_id": uid})
    await db.savings_goals.delete_many({"user_id": uid})
    return {"reset": True}

# ── Health (no auth) ────────────────────────────────────────────────

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# ── Financial Immune System Score ──────────────────────────────────

@api_router.get("/immune-score")
async def get_immune_score(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0}) or {}
    bills = await db.bills.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    goals = await db.savings_goals.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)

    salary = settings.get("salary", 0)
    currency = settings.get("currency", "$")
    total_bills = sum(b["amount"] for b in bills)
    recurring_expenses = sum(e["amount"] for e in expenses if e.get("recurring", False))
    total_obligations = total_bills + recurring_expenses
    total_liquid = sum(g.get("saved", 0) for g in goals)
    total_all_expenses = sum(e["amount"] for e in expenses)
    net = salary - total_bills - total_all_expenses

    # Factor 1: Emergency Fund Coverage (0–35 pts)
    months_covered = (total_liquid / total_obligations) if total_obligations > 0 else (6.0 if total_liquid > 0 else 0.0)
    if months_covered >= 6:
        ef_score = 35.0
    elif months_covered >= 3:
        ef_score = 25.0 + (months_covered - 3) / 3 * 10
    elif months_covered >= 1:
        ef_score = 12.0 + (months_covered - 1) / 2 * 13
    else:
        ef_score = months_covered * 12

    # Factor 2: Fixed Obligation Ratio (0–35 pts)
    obligation_pct = (total_obligations / salary * 100) if salary > 0 else 100.0
    if obligation_pct <= 40:
        ob_score = 35.0
    elif obligation_pct <= 60:
        ob_score = 25.0 - (obligation_pct - 40) / 20 * 10
    elif obligation_pct <= 75:
        ob_score = 15.0 - (obligation_pct - 60) / 15 * 10
    elif obligation_pct <= 90:
        ob_score = 5.0 - (obligation_pct - 75) / 15 * 4
    else:
        ob_score = 0.0

    # Factor 3: Net Savings Rate (0–30 pts)
    savings_rate_pct = max(net / salary * 100, 0) if salary > 0 else 0.0
    if savings_rate_pct >= 20:
        sv_score = 30.0
    elif savings_rate_pct >= 15:
        sv_score = 22.0 + (savings_rate_pct - 15) / 5 * 8
    elif savings_rate_pct >= 10:
        sv_score = 15.0 + (savings_rate_pct - 10) / 5 * 7
    elif savings_rate_pct >= 5:
        sv_score = 8.0 + (savings_rate_pct - 5) / 5 * 7
    else:
        sv_score = savings_rate_pct / 5 * 8

    total_score = min(int(round(ef_score + ob_score + sv_score)), 100)

    if total_score >= 80:
        level, color = "Resilient", "#43a047"
        description = "Your finances could weather a major storm."
    elif total_score >= 60:
        level, color = "Stable", "#1a4a8a"
        description = "You have some buffer but vulnerabilities exist."
    elif total_score >= 40:
        level, color = "Vulnerable", "#b8740a"
        description = "A financial shock could strain you significantly."
    else:
        level, color = "At Risk", "#c84b1f"
        description = "Immediate attention needed — low resilience."

    tips = []
    if months_covered < 3:
        needed = max(total_obligations * 3 - total_liquid, 0)
        tips.append(f"Build emergency fund to cover 3 months ({currency}{needed:,.0f} more needed)")
    if obligation_pct > 60:
        tips.append(f"Fixed obligations are {obligation_pct:.0f}% of income — aim below 60%")
    if savings_rate_pct < 10 and salary > 0:
        tips.append(f"Savings rate is {savings_rate_pct:.0f}% — target at least 10–20%")

    return {
        "score": total_score,
        "level": level,
        "color": color,
        "description": description,
        "factors": {
            "emergency_fund": {
                "score": int(round(ef_score)), "max": 35,
                "months_covered": round(months_covered, 1),
                "total_liquid": total_liquid, "label": "Emergency Fund",
            },
            "obligation_ratio": {
                "score": int(round(ob_score)), "max": 35,
                "pct": round(obligation_pct, 1),
                "total_obligations": total_obligations, "label": "Fixed Obligations",
            },
            "savings_rate": {
                "score": int(round(sv_score)), "max": 30,
                "pct": round(savings_rate_pct, 1),
                "net": net, "label": "Savings Rate",
            },
        },
        "tips": tips,
        "currency": currency,
    }

# ── Subscription Graveyard ─────────────────────────────────────────

@api_router.get("/subscription-graveyard")
async def get_subscription_graveyard(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0}) or {}
    currency = settings.get("currency", "$")

    sub_bills = await db.bills.find(
        {"user_id": uid, "category": "Subscriptions"},
        {"_id": 0, "user_id": 0}
    ).to_list(1000)
    rec_expenses = await db.expenses.find(
        {"user_id": uid, "recurring": True},
        {"_id": 0, "user_id": 0}
    ).to_list(1000)

    user_doc = await db.users.find_one({"_id": ObjectId(uid)}, {"created_at": 1})
    created_at = user_doc.get("created_at", datetime.now(timezone.utc)) if user_doc else datetime.now(timezone.utc)
    months_active = max(1, (datetime.now(timezone.utc) - created_at).days // 30)

    subscriptions = []
    total_monthly = 0.0
    total_waste = 0.0

    for bill in sub_bills:
        monthly = bill["amount"]
        marked_unused = bill.get("marked_unused", False)
        subscriptions.append({
            "id": bill["id"],
            "name": bill["name"],
            "monthly_cost": monthly,
            "cumulative_cost": round(monthly * months_active, 2),
            "months_active": months_active,
            "marked_unused": marked_unused,
            "last_used_date": bill.get("last_used_date"),
            "type": "bill",
            "category": "Subscriptions",
            "is_buried": marked_unused,
        })
        total_monthly += monthly
        if marked_unused:
            total_waste += monthly

    for exp in rec_expenses:
        monthly = exp["amount"]
        marked_unused = exp.get("marked_unused", False)
        subscriptions.append({
            "id": exp["id"],
            "name": exp["name"],
            "monthly_cost": monthly,
            "cumulative_cost": round(monthly * months_active, 2),
            "months_active": months_active,
            "marked_unused": marked_unused,
            "last_used_date": exp.get("last_used_date"),
            "type": "recurring_expense",
            "category": exp.get("category", "Other"),
            "is_buried": marked_unused,
        })
        total_monthly += monthly
        if marked_unused:
            total_waste += monthly

    subscriptions.sort(key=lambda x: (-int(x["is_buried"]), -x["monthly_cost"]))

    return {
        "subscriptions": subscriptions,
        "total_monthly": round(total_monthly, 2),
        "total_annual": round(total_monthly * 12, 2),
        "total_waste_monthly": round(total_waste, 2),
        "total_waste_annual": round(total_waste * 12, 2),
        "currency": currency,
        "months_active": months_active,
    }

@api_router.patch("/subscription-graveyard/{sub_id}/toggle-unused")
async def toggle_subscription_unused(sub_id: str, user: dict = Depends(get_current_user)):
    uid = user["_id"]
    bill = await db.bills.find_one({"id": sub_id, "user_id": uid})
    if bill:
        new_val = not bill.get("marked_unused", False)
        await db.bills.update_one({"id": sub_id, "user_id": uid}, {"$set": {"marked_unused": new_val}})
        return {"marked_unused": new_val}
    exp = await db.expenses.find_one({"id": sub_id, "user_id": uid})
    if exp:
        new_val = not exp.get("marked_unused", False)
        await db.expenses.update_one({"id": sub_id, "user_id": uid}, {"$set": {"marked_unused": new_val}})
        return {"marked_unused": new_val}
    raise HTTPException(status_code=404, detail="Subscription not found")

# ── Future Self Projector ──────────────────────────────────────────

@api_router.post("/future-self")
async def get_future_self(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}) or {}
    bills = await db.bills.find({"user_id": uid}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid}).to_list(1000)
    goals = await db.savings_goals.find({"user_id": uid}).to_list(1000)

    salary = settings.get("salary", 0)
    currency = settings.get("currency", "$")
    total_bills = sum(b["amount"] for b in bills)
    total_expenses = sum(e["amount"] for e in expenses)
    total_saved = sum(g.get("saved", 0) for g in goals)
    net_monthly = salary - total_bills - total_expenses

    sub_waste = sum(b["amount"] for b in bills if b.get("marked_unused", False))
    rec_waste = sum(e["amount"] for e in expenses if e.get("marked_unused", False))
    monthly_optimization = sub_waste + rec_waste
    if monthly_optimization == 0:
        monthly_optimization = round(total_expenses * 0.10, 2)

    optimized_net = net_monthly + monthly_optimization

    ANNUAL_RETURN = 0.07
    monthly_return = (1 + ANNUAL_RETURN) ** (1 / 12) - 1

    def project(monthly_savings: float, years: int) -> int:
        balance = float(total_saved)
        for _ in range(years * 12):
            balance = balance * (1 + monthly_return) + max(monthly_savings, 0)
        return int(round(balance))

    horizons = [5, 10, 20, 30]
    return {
        "currency": currency,
        "current": {
            "monthly_savings": round(max(net_monthly, 0)),
            "monthly_spend": round(total_bills + total_expenses),
            "projections": [{"years": y, "balance": project(max(net_monthly, 0), y), "label": f"{y}yr"} for y in horizons],
        },
        "optimized": {
            "monthly_savings": round(max(optimized_net, 0)),
            "monthly_spend": round(total_bills + total_expenses - monthly_optimization),
            "monthly_freed": round(monthly_optimization),
            "projections": [{"years": y, "balance": project(max(optimized_net, 0), y), "label": f"{y}yr"} for y in horizons],
        },
        "assumptions": {
            "annual_return_pct": ANNUAL_RETURN * 100,
            "starting_balance": round(total_saved),
            "optimization_source": "subscription_cleanup" if (sub_waste + rec_waste) > 0 else "10pct_discretionary_reduction",
        },
    }

# ── AI Advisor (LLM-powered personal finance coach) ────────────────

from emergentintegrations.llm.chat import LlmChat, UserMessage
import httpx

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
ADVISOR_MODEL_PROVIDER = "openai"
ADVISOR_MODEL_NAME = "gpt-4.1-mini"  # cost-efficient, high quality for chat

LANGUAGE_NAMES = {"en": "English", "es": "Spanish", "pt-BR": "Brazilian Portuguese"}

class AdvisorChatInput(BaseModel):
    message: str
    session_id: Optional[str] = None
    language: Optional[str] = "en"

async def _build_financial_context(user_id: str) -> str:
    """Fetch user's financial snapshot and format for LLM context."""
    settings = await db.settings.find_one({"user_id": user_id}) or {}
    bills = await db.bills.find({"user_id": user_id}).to_list(length=100)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    expenses = await db.expenses.find({
        "user_id": user_id,
        "date": {"$gte": month_start.isoformat()}
    }).to_list(length=500)

    salary = settings.get("salary", 0)
    currency = settings.get("currency", "$")
    pct_needs = settings.get("pctNeeds", 50)
    pct_wants = settings.get("pctWants", 30)
    pct_savings = settings.get("pctSavings", 20)

    total_bills = sum(b.get("amount", 0) for b in bills)
    total_expenses = sum(e.get("amount", 0) for e in expenses)

    # Group expenses by category
    cat_totals: dict = {}
    for e in expenses:
        cat = e.get("category", "Other")
        cat_totals[cat] = cat_totals.get(cat, 0) + e.get("amount", 0)
    top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:5]

    bill_lines = "\n".join([f"  - {b.get('name','')} ({b.get('category','')}): {currency}{b.get('amount',0):.2f} on day {b.get('dueDay','?')}" for b in bills[:10]]) or "  (none)"
    cat_lines = "\n".join([f"  - {c}: {currency}{a:.2f}" for c, a in top_cats]) or "  (none yet this month)"

    # Financial health metrics
    smart_context = ""
    try:
        days_elapsed = max(now.day, 1)
        daily_burn = total_expenses / days_elapsed if days_elapsed else 0
        wants_budget = salary * (pct_wants / 100)
        discretionary_remaining = max(wants_budget - total_expenses, 0)
        runway_days = int(discretionary_remaining / daily_burn) if daily_burn > 0.01 else 999
        bills_ratio = total_bills / salary if salary > 0 else 0
        if bills_ratio >= 0.6:
            risk = "HIGH (bills are very expensive)"
        elif bills_ratio >= 0.5:
            risk = "MEDIUM"
        else:
            risk = "LOW"
        if runway_days < 999:
            smart_context = f"\nFINANCIAL HEALTH METRICS:\n- Risk level: {risk}\n- Bills are {int(bills_ratio*100)}% of income\n- Discretionary runway: {runway_days} days at current pace\n- Daily burn rate: {currency}{daily_burn:.2f}/day"
    except Exception:
        pass

    # Live FX rates — reuse cache if warm, otherwise fetch fresh
    fx_context = ""
    try:
        import time as _time
        rates = None
        if _fx_cache.get("data") and (_time.time() - _fx_cache.get("ts", 0)) < _fx_cache_ttl:
            rates = _fx_cache["data"]
        else:
            async with httpx.AsyncClient(timeout=6.0) as http:
                bases: dict = {}
                for base, quote in DEFAULT_FX_PAIRS:
                    bases.setdefault(base, []).append(quote)
                fresh = []
                for base, quotes in bases.items():
                    try:
                        r = await http.get(f"https://api.frankfurter.dev/v1/latest?base={base}&symbols={','.join(quotes)}")
                        if r.status_code == 200:
                            d = r.json()
                            for q, rate in d.get("rates", {}).items():
                                fresh.append({"base": base, "quote": q, "rate": rate, "date": d.get("date")})
                    except Exception:
                        continue
                if fresh:
                    _fx_cache["data"] = fresh
                    _fx_cache["ts"] = _time.time()
                    rates = fresh
        if rates:
            rate_lines = "\n".join(
                f"  {r['base']}/{r['quote']}: {r['rate']:.4f}  (as of {r.get('date','today')})"
                for r in rates
            )
            fx_context = f"\n\nLIVE EXCHANGE RATES (ECB/Frankfurter data):\n{rate_lines}"
    except Exception:
        pass

    return f"""USER FINANCIAL SNAPSHOT (current month: {now.strftime('%B %Y')}):

Monthly Net Salary: {currency}{salary:.2f}
Currency: {currency}
Budget Split Target: {pct_needs}% Needs / {pct_wants}% Wants / {pct_savings}% Savings

RECURRING BILLS (total {currency}{total_bills:.2f}/mo):
{bill_lines}

THIS MONTH'S EXPENSES SO FAR (total {currency}{total_expenses:.2f}):
Top categories:
{cat_lines}

Remaining disposable after bills: {currency}{max(salary - total_bills, 0):.2f}{smart_context}{fx_context}
"""

ADVISOR_SYSTEM_PROMPT = """You are FinBot, a friendly, concise personal-finance coach built into the FinFlow app.

You help users budget smarter using the 50/30/20 rule (Needs/Wants/Savings), reduce spending, build savings, and make smart money decisions.

GUIDELINES:
- Keep responses under 180 words unless a detailed plan is explicitly requested.
- Use the user's actual financial data (provided in context) — refer to specific numbers and categories.
- Be warm, practical, and non-judgmental. Never shame the user about their spending.
- Give concrete, actionable steps (e.g., "Meal-prep 3x/week could save ~$120/mo").
- Use the user's currency symbol shown in context.
- When giving numbers, be realistic — don't over-promise.
- Format with short paragraphs, bullet points, or numbered steps for clarity.
- If the user asks something unrelated to personal finance, politely redirect.
- Never give legal, tax, or investment-advice disclaimers unless the user asks specifically about investing/taxes.

LIVE MARKET DATA:
- You have access to live exchange rates in the context under "LIVE EXCHANGE RATES".
- When the user asks about currency rates (e.g. "how is the dollar today?", "what is USD/BRL?", "euro rate?"), answer directly using those rates — state the exact rate and the date it was fetched.
- Always clarify the rate is from ECB/Frankfurter data and refreshes every 15 minutes.
- If a rate pair is not in the list, say so clearly rather than guessing.
- You may also connect exchange rate movements to the user's personal finances when relevant (e.g. if they earn in one currency but spend in another)."""

def _lang_directive(lang: Optional[str]) -> str:
    name = LANGUAGE_NAMES.get(lang or "en", "English")
    if name == "English":
        return ""
    return f"\n\nIMPORTANT: Respond in {name}. All of your reply text must be in {name}."

@api_router.post("/ai-advisor/chat")
async def ai_advisor_chat(data: AdvisorChatInput, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI Advisor not configured")
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_id = user["_id"]
    session_id = data.session_id or str(uuid.uuid4())

    # Store user message
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.ai_messages.insert_one({
        "user_id": user_id,
        "session_id": session_id,
        "role": "user",
        "content": data.message.strip(),
        "timestamp": now_iso,
    })

    # Build context from user's financial data
    financial_ctx = await _build_financial_context(user_id)
    system_msg = f"{ADVISOR_SYSTEM_PROMPT}\n\n{financial_ctx}{_lang_directive(data.language)}"

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_msg,
        ).with_model(ADVISOR_MODEL_PROVIDER, ADVISOR_MODEL_NAME)

        reply = await chat.send_message(UserMessage(text=data.message.strip()))
        reply_text = str(reply) if reply else "I'm sorry, I couldn't generate a response. Please try again."
    except Exception as e:
        logger.exception("AI Advisor error")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)[:200]}")

    # Store assistant reply
    await db.ai_messages.insert_one({
        "user_id": user_id,
        "session_id": session_id,
        "role": "assistant",
        "content": reply_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"session_id": session_id, "reply": reply_text}


@api_router.get("/ai-advisor/history")
async def ai_advisor_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    query = {"user_id": user_id}
    if session_id:
        query["session_id"] = session_id
    docs = await db.ai_messages.find(query).sort("timestamp", 1).to_list(length=200)
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"messages": docs}


@api_router.delete("/ai-advisor/history")
async def ai_advisor_clear_history(user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    result = await db.ai_messages.delete_many({"user_id": user_id})
    return {"deleted": result.deleted_count}


@api_router.get("/ai-advisor/insight")
async def ai_advisor_daily_insight(user: dict = Depends(get_current_user)):
    """Generate a short, personalized daily money tip based on user's current data."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI Advisor not configured")
    user_id = user["_id"]

    # Check if we already have today's insight cached
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cached = await db.ai_insights.find_one({"user_id": user_id, "date": today_key})
    if cached:
        return {"insight": cached["content"], "cached": True}

    financial_ctx = await _build_financial_context(user_id)
    system_msg = (
        "You are FinBot, a personal finance coach. Generate ONE short, punchy, actionable money tip "
        "(under 50 words) tailored to the user's financial snapshot. Reference specific numbers. "
        "Be encouraging and warm. Do not greet or say 'hello'. Start directly with the insight."
    )
    prompt = f"{financial_ctx}\n\nGenerate today's money tip:"

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"insight-{user_id}-{today_key}",
            system_message=system_msg,
        ).with_model(ADVISOR_MODEL_PROVIDER, ADVISOR_MODEL_NAME)
        reply = await chat.send_message(UserMessage(text=prompt))
        insight_text = str(reply).strip() if reply else "Track your expenses daily — small leaks sink big ships."
    except Exception as e:
        logger.exception("Insight error")
        # Fallback insight so UI never breaks
        insight_text = "Track your expenses daily — small leaks sink big ships. Open the Expenses tab to log today's spending."

    await db.ai_insights.insert_one({
        "user_id": user_id,
        "date": today_key,
        "content": insight_text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"insight": insight_text, "cached": False}


# ── Smart Insights Engine (Predictive + Leaks + Personality) ──────

def _iso_month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

def _parse_expense_date(s):
    """Robustly parse an ISO date string into a timezone-aware datetime (UTC).
    Returns None if unparseable. Fixes naive/aware comparison crashes.
    """
    try:
        if not isinstance(s, str):
            # Already a datetime? Make it timezone-aware.
            if isinstance(s, datetime):
                return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
            return None
        d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def _days_until_month_end(now: datetime) -> int:
    import calendar
    last_day = calendar.monthrange(now.year, now.month)[1]
    return max(last_day - now.day, 0)

@api_router.get("/insights")
async def get_insights(user: dict = Depends(get_current_user)):
    """Unified smart-insights endpoint: forecast + leaks + personality + weekly report."""
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}, {"_id": 0, "user_id": 0}) or {}
    bills = await db.bills.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(2000)

    salary = float(settings.get("salary", 0))
    currency = settings.get("currency", "$")
    pct_needs = settings.get("pctNeeds", 50) / 100.0
    pct_wants = settings.get("pctWants", 30) / 100.0
    pct_savings = settings.get("pctSavings", 20) / 100.0

    now = datetime.now(timezone.utc)
    month_start = _iso_month_start(now)
    last_month_start = _iso_month_start((month_start - timedelta(days=1)))
    last_week_start = now - timedelta(days=7)

    # Parse expense dates robustly (timezone-aware, handles naive/aware mixing)
    parse_date = _parse_expense_date

    cur_month_exp = [e for e in expenses if (d := parse_date(e.get("date"))) and d >= month_start]
    last_month_exp = [e for e in expenses if (d := parse_date(e.get("date"))) and last_month_start <= d < month_start]
    last_week_exp = [e for e in expenses if (d := parse_date(e.get("date"))) and d >= last_week_start]

    total_bills = sum(b["amount"] for b in bills)
    total_exp_month = sum(e["amount"] for e in cur_month_exp)
    total_exp_last_month = sum(e["amount"] for e in last_month_exp)
    total_exp_week = sum(e["amount"] for e in last_week_exp)

    wants_budget = salary * pct_wants
    # ═══ 1. PREDICTIVE FORECAST ═══
    days_elapsed = max(now.day, 1)
    days_left = _days_until_month_end(now)
    daily_burn = total_exp_month / days_elapsed if days_elapsed else 0
    projected_month_exp = daily_burn * (days_elapsed + days_left) if days_elapsed else 0
    projected_end_balance = salary - total_bills - projected_month_exp

    # Discretionary runway: how many days until wants budget is exhausted at current pace
    discretionary_remaining = max(wants_budget - total_exp_month, 0)
    runway_days = int(discretionary_remaining / daily_burn) if daily_burn > 0.01 else 999

    # Risk level
    bills_ratio = total_bills / salary if salary > 0 else 0
    if salary == 0:
        risk_level, risk_reason = "unknown", "Set your salary to see risk analysis"
    elif bills_ratio >= 0.6:
        risk_level, risk_reason = "high", f"Bills are {int(bills_ratio*100)}% of income"
    elif projected_end_balance < 0:
        risk_level, risk_reason = "high", "Projected to overspend this month"
    elif bills_ratio >= 0.5 or runway_days < 7:
        risk_level, risk_reason = "medium", "Watch your discretionary spending"
    else:
        risk_level, risk_reason = "low", "You're on a healthy financial track"

    forecast = {
        "runway_days": runway_days,
        "discretionary_remaining": round(discretionary_remaining, 2),
        "daily_burn": round(daily_burn, 2),
        "projected_month_exp": round(projected_month_exp, 2),
        "projected_end_balance": round(projected_end_balance, 2),
        "risk_level": risk_level,
        "risk_reason": risk_reason,
        "days_left_in_month": days_left,
    }

    # ═══ 2. MONEY LEAKS DETECTION ═══
    leaks = []

    # 2a. Category spending creep (current month vs last month same-day prorated)
    cur_by_cat: dict = {}
    for e in cur_month_exp:
        cur_by_cat[e["category"]] = cur_by_cat.get(e["category"], 0) + e["amount"]
    last_by_cat: dict = {}
    for e in last_month_exp:
        last_by_cat[e["category"]] = last_by_cat.get(e["category"], 0) + e["amount"]

    days_in_last_month = ((month_start - last_month_start).days) or 30
    prorate = days_elapsed / days_in_last_month
    for cat, cur_amt in cur_by_cat.items():
        last_amt = last_by_cat.get(cat, 0)
        expected_so_far = last_amt * prorate
        if expected_so_far > 20 and cur_amt > expected_so_far * 1.25:
            pct_increase = int(((cur_amt - expected_so_far) / expected_so_far) * 100)
            leaks.append({
                "type": "creep",
                "severity": "medium" if pct_increase < 50 else "high",
                "title": f"{cat} spending up {pct_increase}%",
                "description": f"You've spent {currency}{cur_amt:.0f} on {cat} this month vs {currency}{expected_so_far:.0f} expected at this pace.",
                "estimated_waste": round(cur_amt - expected_so_far, 2),
                "category": cat,
            })

    # 2b. Likely forgotten subscriptions: small recurring bills ($5-$30) in Subscriptions category
    for b in bills:
        amt = b.get("amount", 0)
        cat = b.get("category", "")
        if 5 <= amt <= 35 and cat in ("Subscriptions", "Entertainment", "Other"):
            leaks.append({
                "type": "subscription",
                "severity": "low",
                "title": f"Review subscription: {b.get('name', 'Unknown')}",
                "description": f"Small recurring charge of {currency}{amt:.2f}/mo. Cancel if unused = save {currency}{amt*12:.0f}/yr.",
                "estimated_waste": round(amt * 12, 2),
                "category": cat,
            })

    # 2c. Duplicate charges (same merchant + same amount within 7 days)
    seen = {}
    for e in sorted(cur_month_exp + last_week_exp, key=lambda x: parse_date(x.get("date")) or now):
        name = (e.get("name") or "").strip().lower()
        amt = e.get("amount", 0)
        d = parse_date(e.get("date"))
        if not name or not d:
            continue
        key = f"{name}:{amt:.2f}"
        if key in seen:
            prev_d = seen[key]
            delta = abs((d - prev_d).days)
            if delta <= 7:
                leaks.append({
                    "type": "duplicate",
                    "severity": "high",
                    "title": f"Possible duplicate charge: {e.get('name')}",
                    "description": f"{currency}{amt:.2f} charged twice within {delta} days. Worth reviewing.",
                    "estimated_waste": round(amt, 2),
                    "category": e.get("category", ""),
                })
        seen[key] = d

    # Sort leaks by estimated_waste desc, cap to top 6
    leaks.sort(key=lambda x: -x["estimated_waste"])
    leaks = leaks[:6]
    total_leak_savings = round(sum(l["estimated_waste"] for l in leaks), 2)

    # ═══ 3. FINANCIAL PERSONALITY ═══
    # Classify based on behavior patterns
    personality = "explorer"
    personality_desc = "Still gathering data on your habits…"

    if salary > 0 and (bills or cur_month_exp):
        savings_pct_actual = (salary - total_bills - total_exp_month) / salary if salary else 0
        dining_ratio = cur_by_cat.get("Dining", 0) / max(total_exp_month, 1)
        shopping_ratio = cur_by_cat.get("Shopping", 0) / max(total_exp_month, 1)
        entertainment_ratio = cur_by_cat.get("Entertainment", 0) / max(total_exp_month, 1)
        impulse_ratio = dining_ratio + shopping_ratio + entertainment_ratio

        if savings_pct_actual >= 0.25 and bills_ratio < 0.4:
            personality = "optimizer"
            personality_desc = f"You save {int(savings_pct_actual*100)}% and keep bills low — textbook financial discipline."
        elif savings_pct_actual >= 0.15 and impulse_ratio < 0.35:
            personality = "stability_seeker"
            personality_desc = "You prioritize steady savings and predictable spending. Reliable and balanced."
        elif impulse_ratio > 0.50:
            personality = "impulse_spender"
            personality_desc = f"{int(impulse_ratio*100)}% of spending goes to dining, shopping, and entertainment. Treats are great, but watch the pace."
        elif savings_pct_actual < 0:
            personality = "overextended"
            personality_desc = "Expenses exceed income this month. Let's find quick wins to turn this around."
        else:
            personality = "balanced"
            personality_desc = "You're navigating money thoughtfully — neither too strict nor too loose."

    personality_labels = {
        "optimizer": {"label": "Optimizer", "emoji": "🎯", "color": "#2d5a3d"},
        "stability_seeker": {"label": "Stability Seeker", "emoji": "🏛️", "color": "#1A4A8A"},
        "impulse_spender": {"label": "Impulse Spender", "emoji": "⚡", "color": "#c84b1f"},
        "overextended": {"label": "Overextended", "emoji": "🆘", "color": "#b0252b"},
        "balanced": {"label": "Balanced", "emoji": "⚖️", "color": "#b8740a"},
        "explorer": {"label": "Explorer", "emoji": "🧭", "color": "#6b7280"},
    }
    personality_obj = {
        "key": personality,
        **personality_labels[personality],
        "description": personality_desc,
    }

    # ═══ 4. WEEKLY REPORT ═══
    weekly_exp_by_cat: dict = {}
    for e in last_week_exp:
        weekly_exp_by_cat[e["category"]] = weekly_exp_by_cat.get(e["category"], 0) + e["amount"]
    top_week_cat = max(weekly_exp_by_cat.items(), key=lambda x: x[1])[0] if weekly_exp_by_cat else None

    # Compare to prior week (7-14 days ago)
    prior_week_start = now - timedelta(days=14)
    prior_week_exp = [e for e in expenses if (d := parse_date(e.get("date"))) and prior_week_start <= d < last_week_start]
    total_prior_week = sum(e["amount"] for e in prior_week_exp)
    week_change_pct = 0
    if total_prior_week > 0:
        week_change_pct = int(((total_exp_week - total_prior_week) / total_prior_week) * 100)

    weekly_report = {
        "week_total": round(total_exp_week, 2),
        "prior_week_total": round(total_prior_week, 2),
        "change_pct": week_change_pct,
        "top_category": top_week_cat,
        "transaction_count": len(last_week_exp),
    }

    return {
        "currency": currency,
        "forecast": forecast,
        "leaks": leaks,
        "total_leak_savings": total_leak_savings,
        "personality": personality_obj,
        "weekly_report": weekly_report,
    }


# ── Scenario Simulator ─────────────────────────────────────────────

class ScenarioInput(BaseModel):
    salary: float
    bills_adjustment: float = 0      # add/subtract from current bills total
    monthly_savings_target: float = 0  # monthly amount toward a goal
    big_purchase_amount: float = 0   # one-time purchase
    goal_name: Optional[str] = "My goal"
    goal_target_amount: Optional[float] = 0


@api_router.post("/scenario")
async def run_scenario(data: ScenarioInput, user: dict = Depends(get_current_user)):
    uid = user["_id"]
    settings = await db.settings.find_one({"user_id": uid}) or {}
    bills = await db.bills.find({"user_id": uid}).to_list(500)
    now = datetime.now(timezone.utc)
    month_start = _iso_month_start(now)

    def parse_date(s):
        return _parse_expense_date(s)

    expenses_docs = await db.expenses.find({"user_id": uid}).to_list(2000)
    cur_month_exp = [e for e in expenses_docs if (d := parse_date(e.get("date"))) and d >= month_start]

    current_bills = sum(b["amount"] for b in bills)
    current_exp_avg = sum(e["amount"] for e in cur_month_exp)

    new_salary = data.salary
    new_bills = max(current_bills + data.bills_adjustment, 0)
    projected_savings = data.monthly_savings_target
    net_left = new_salary - new_bills - current_exp_avg - projected_savings

    # Savings timeline for goal
    timeline_months = None
    if data.goal_target_amount and data.goal_target_amount > 0 and projected_savings > 0:
        effective = projected_savings - (data.big_purchase_amount / 12 if data.big_purchase_amount else 0)
        if effective > 0:
            timeline_months = max(int(data.goal_target_amount / effective), 1)

    # Risk assessment
    bills_ratio = new_bills / new_salary if new_salary > 0 else 0
    if net_left < 0 or bills_ratio > 0.6:
        risk = "high"
    elif bills_ratio > 0.5 or net_left < new_salary * 0.1:
        risk = "medium"
    else:
        risk = "low"

    return {
        "new_salary": round(new_salary, 2),
        "new_bills": round(new_bills, 2),
        "projected_monthly_expenses": round(current_exp_avg, 2),
        "monthly_savings": round(projected_savings, 2),
        "net_left": round(net_left, 2),
        "bills_ratio_pct": round(bills_ratio * 100, 1),
        "risk_level": risk,
        "goal_timeline_months": timeline_months,
        "goal_name": data.goal_name,
        "goal_target": data.goal_target_amount,
    }


# ── Markets: FX rates & Stock quotes ──────────────────────────────

_fx_cache: dict = {"ts": 0, "data": None}
_fx_cache_ttl = 900  # 15 min
_stock_cache: dict = {}  # symbol -> {ts, data}
_stock_cache_ttl = 300  # 5 min

DEFAULT_FX_PAIRS = [
    ("USD", "BRL"), ("USD", "EUR"), ("USD", "GBP"),
    ("USD", "JPY"), ("USD", "CAD"), ("USD", "AUD"),
    ("EUR", "USD"), ("BRL", "USD"),
]

DEFAULT_STOCK_SYMBOLS = ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "AMZN", "META"]


@api_router.get("/markets/fx")
async def get_fx_rates(user: dict = Depends(get_current_user)):
    """Live currency exchange rates via Frankfurter.dev (free, no key, ECB data)."""
    import time
    now = time.time()
    if _fx_cache["data"] and (now - _fx_cache["ts"]) < _fx_cache_ttl:
        return {"rates": _fx_cache["data"], "cached": True}

    results = []
    # Frankfurter needs separate requests per base currency. Batch by base.
    bases = {}
    for base, quote in DEFAULT_FX_PAIRS:
        bases.setdefault(base, []).append(quote)

    try:
        async with httpx.AsyncClient(timeout=8.0) as http:
            for base, quotes in bases.items():
                symbols = ",".join(quotes)
                try:
                    r = await http.get(f"https://api.frankfurter.dev/v1/latest?base={base}&symbols={symbols}")
                    if r.status_code == 200:
                        data = r.json()
                        rates = data.get("rates", {})
                        for q in quotes:
                            if q in rates:
                                results.append({
                                    "base": base,
                                    "quote": q,
                                    "rate": rates[q],
                                    "date": data.get("date"),
                                })
                except Exception:
                    continue
    except Exception as e:
        logger.exception("FX error")
        raise HTTPException(status_code=503, detail=f"FX service unavailable: {str(e)[:100]}")

    if not results:
        raise HTTPException(status_code=503, detail="Could not fetch FX rates right now")

    _fx_cache["data"] = results
    _fx_cache["ts"] = now
    return {"rates": results, "cached": False}


async def _fetch_stock_quote(http: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    """Finnhub quote endpoint. c=current, d=diff, dp=diffPct, pc=prev close, h/l=day high/low."""
    import time
    cached = _stock_cache.get(symbol)
    now = time.time()
    if cached and (now - cached["ts"]) < _stock_cache_ttl:
        return cached["data"]
    if not FINNHUB_API_KEY:
        return None
    try:
        r = await http.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": symbol, "token": FINNHUB_API_KEY},
        )
        if r.status_code != 200:
            return None
        j = r.json()
        # Finnhub returns all zeros for unknown symbols
        if not j or not j.get("c"):
            return None
        data = {
            "symbol": symbol,
            "price": j.get("c"),
            "change": j.get("d"),
            "changePercent": j.get("dp"),
            "high": j.get("h"),
            "low": j.get("l"),
            "prevClose": j.get("pc"),
        }
        _stock_cache[symbol] = {"ts": now, "data": data}
        return data
    except Exception:
        return None


@api_router.get("/markets/stocks")
async def get_stock_quotes(symbols: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get stock quotes for a list of symbols (comma-separated). Defaults to user's watchlist or popular stocks."""
    sym_list: list = []
    if symbols:
        sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    else:
        # Load user watchlist
        user_id = user["_id"]
        wl_docs = await db.watchlist.find({"user_id": user_id}).to_list(length=50)
        if wl_docs:
            sym_list = [d["symbol"] for d in wl_docs]
        else:
            sym_list = DEFAULT_STOCK_SYMBOLS[:5]

    if not sym_list:
        return {"quotes": []}
    if len(sym_list) > 20:
        sym_list = sym_list[:20]

    quotes = []
    async with httpx.AsyncClient(timeout=8.0) as http:
        import asyncio
        results = await asyncio.gather(*[_fetch_stock_quote(http, s) for s in sym_list], return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                quotes.append(r)
    return {"quotes": quotes}


class WatchlistInput(BaseModel):
    symbol: str


@api_router.get("/watchlist")
async def list_watchlist(user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    docs = await db.watchlist.find({"user_id": user_id}).sort("created_at", 1).to_list(length=50)
    return [{"id": str(d["_id"]), "symbol": d["symbol"]} for d in docs]


@api_router.post("/watchlist")
async def add_watchlist(data: WatchlistInput, user: dict = Depends(get_current_user)):
    symbol = (data.symbol or "").strip().upper()
    if not symbol or len(symbol) > 10:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    user_id = user["_id"]
    # de-dupe
    existing = await db.watchlist.find_one({"user_id": user_id, "symbol": symbol})
    if existing:
        return {"id": str(existing["_id"]), "symbol": symbol}
    # Verify symbol exists via Finnhub before adding
    if FINNHUB_API_KEY:
        async with httpx.AsyncClient(timeout=6.0) as http:
            quote = await _fetch_stock_quote(http, symbol)
            if not quote:
                raise HTTPException(status_code=400, detail=f"Unknown stock symbol: {symbol}")
    res = await db.watchlist.insert_one({
        "user_id": user_id,
        "symbol": symbol,
        "created_at": datetime.now(timezone.utc),
    })
    return {"id": str(res.inserted_id), "symbol": symbol}


@api_router.delete("/watchlist/{symbol}")
async def remove_watchlist(symbol: str, user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    res = await db.watchlist.delete_one({"user_id": user_id, "symbol": symbol.strip().upper()})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    return {"deleted": True}


# ── Plaid (Bank Account Sync, US only, Premium) ──────────────────────

import json
from pymongo.errors import DuplicateKeyError
import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_recurring_get_request import TransactionsRecurringGetRequest
from plaid.model.item_remove_request import ItemRemoveRequest

PLAID_CLIENT_ID = os.environ.get("PLAID_CLIENT_ID", "")
PLAID_SECRET = os.environ.get("PLAID_SECRET", "")
PLAID_ENV = os.environ.get("PLAID_ENV", "sandbox")  # sandbox | production
FEATURES_BACKEND_URL = os.environ.get("FEATURES_BACKEND_URL", "https://finflowadvisors.com").rstrip("/")

_plaid_configuration = plaid.Configuration(
    host={"sandbox": plaid.Environment.Sandbox, "production": plaid.Environment.Production}.get(
        PLAID_ENV, plaid.Environment.Sandbox
    ),
    api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
)
plaid_client = plaid_api.PlaidApi(plaid.ApiClient(_plaid_configuration))


class PlaidExchangeRequest(BaseModel):
    public_token: str
    institution_name: Optional[str] = None


# Plaid's Personal Finance Category `primary` -> this app's fixed category
# strings (frontend/src/types.ts BILL_CATEGORIES / EXPENSE_CATEGORIES). Categories
# are unvalidated plain strings server-side, so an unmapped entry falling back to
# "Other" only degrades UI categorization, it can't break anything.
PLAID_TO_BILL_CATEGORY = {
    "RENT_AND_UTILITIES": "Housing",
    "LOAN_PAYMENTS": "Housing",
    "HOME_IMPROVEMENT": "Housing",
    "MEDICAL": "Health",
    "GENERAL_SERVICES": "Subscriptions",
    "ENTERTAINMENT": "Subscriptions",
    "TRANSPORTATION": "Transport",
    "GOVERNMENT_AND_NON_PROFIT": "Insurance",
}
PLAID_TO_EXPENSE_CATEGORY = {
    "FOOD_AND_DRINK": "Dining",
    "GENERAL_MERCHANDISE": "Shopping",
    "TRANSPORTATION": "Transport",
    "ENTERTAINMENT": "Entertainment",
    "MEDICAL": "Health",
    "TRAVEL": "Travel",
    "PERSONAL_CARE": "Personal care",
    "BANK_FEES": "Other",
}

# Premium status lives on a separate "features" backend (finflowadvisors.com),
# not in this service. Verify it there on every Plaid call, forwarding a freshly
# minted token for the same user (both backends share JWT_SECRET, so this is
# equivalent to forwarding the caller's own token, without needing the raw
# Request object threaded through every route). Cached briefly per user so we
# don't hammer the features backend on repeat interactive calls.
_premium_cache: dict = {}  # user_id -> (expires_at_epoch, is_premium)
_PREMIUM_CACHE_TTL = 180  # seconds

async def _require_premium(user: dict):
    uid = user["_id"]
    now = time.time()
    cached = _premium_cache.get(uid)
    if cached and cached[0] > now:
        if not cached[1]:
            raise HTTPException(status_code=403, detail="Premium subscription required")
        return
    is_premium = False
    try:
        token = create_access_token(uid, user["email"])
        async with httpx.AsyncClient(timeout=6.0) as http:
            r = await http.get(
                f"{FEATURES_BACKEND_URL}/api/billing/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.status_code == 200:
                is_premium = bool(r.json().get("premium"))
    except Exception:
        logger.warning("Premium check against features backend failed", exc_info=True)
        # fail closed on error -- is_premium stays False; a features-backend
        # outage must not grant free access to a feature that costs Plaid usage.
    _premium_cache[uid] = (now + _PREMIUM_CACHE_TTL, is_premium)
    if not is_premium:
        raise HTTPException(status_code=403, detail="Premium subscription required")


def _plaid_error(e: "plaid.ApiException") -> HTTPException:
    try:
        body = json.loads(e.body) if e.body else {}
    except Exception:
        body = {}
    code = body.get("error_code", "unknown_error")
    logger.warning("Plaid API error: %s", code)
    return HTTPException(status_code=502, detail=f"Plaid error: {code}")


@api_router.post("/plaid/link-token")
async def plaid_link_token(user: dict = Depends(get_current_user)):
    await _require_premium(user)
    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=user["_id"]),
        client_name="FinFlowAdvisors",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en",
    )
    try:
        resp = await asyncio.to_thread(plaid_client.link_token_create, req)
    except plaid.ApiException as e:
        raise _plaid_error(e)
    return {"link_token": resp.link_token}


@api_router.post("/plaid/exchange")
async def plaid_exchange(data: PlaidExchangeRequest, user: dict = Depends(get_current_user)):
    await _require_premium(user)
    req = ItemPublicTokenExchangeRequest(public_token=data.public_token)
    try:
        resp = await asyncio.to_thread(plaid_client.item_public_token_exchange, req)
    except plaid.ApiException as e:
        raise _plaid_error(e)
    await db.plaid_items.update_one(
        {"user_id": user["_id"], "item_id": resp.item_id},
        {
            "$set": {
                "access_token": resp.access_token,
                "institution_name": data.institution_name,
                "status": "active",
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": user["_id"],
                "item_id": resp.item_id,
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    # Frontend triggers the first /plaid/sync itself right after this call --
    # kept separate so this endpoint stays fast and single-responsibility.
    return {"item_id": resp.item_id, "institution_name": data.institution_name}


@api_router.post("/plaid/sync")
async def plaid_sync(user: dict = Depends(get_current_user)):
    await _require_premium(user)
    uid = user["_id"]
    items = await db.plaid_items.find({"user_id": uid, "status": {"$in": ["active", "error"]}}).to_list(50)
    expenses_created = 0
    bills_upserted = 0
    removed_count = 0

    for item in items:
        access_token = item["access_token"]

        # 1) Recurring outflow streams -> bills, upserted idempotently on stream_id.
        #    Plaid's TransactionStream carries the exact member transaction_ids, so we
        #    can precisely exclude those from the individual-expense import below
        #    instead of fuzzy-matching by name/amount.
        recurring_transaction_ids: set = set()
        try:
            rec_resp = await asyncio.to_thread(
                plaid_client.transactions_recurring_get,
                TransactionsRecurringGetRequest(access_token=access_token),
            )
            for stream in rec_resp.outflow_streams:
                if not stream.is_active or stream.status == "TOMBSTONED":
                    continue
                recurring_transaction_ids.update(stream.transaction_ids or [])
                primary_cat = (
                    stream.personal_finance_category.primary if stream.personal_finance_category else None
                )
                due_day = stream.last_date.day if stream.last_date else None
                amt_obj = stream.last_amount or stream.average_amount
                amount = abs(amt_obj.amount) if amt_obj else 0.0
                await db.bills.update_one(
                    {"user_id": uid, "plaid_recurring_id": stream.stream_id},
                    {
                        "$set": {
                            "name": stream.merchant_name or stream.description,
                            "category": PLAID_TO_BILL_CATEGORY.get(primary_cat, "Other"),
                            "amount": amount,
                            "dueDay": due_day,
                        },
                        "$setOnInsert": {
                            "id": str(uuid.uuid4()),
                            "user_id": uid,
                            "plaid_recurring_id": stream.stream_id,
                        },
                    },
                    upsert=True,
                )
                bills_upserted += 1
        except plaid.ApiException as e:
            logger.warning("Plaid recurring-get failed for item %s: %s", item.get("item_id"), e)
            # Non-fatal -- still import individual transactions below even if
            # recurring detection fails for this item.

        # 2) Cursor-based transaction sync -> non-recurring outflows become expenses.
        cursor = item.get("cursor")
        added, removed = [], []
        has_more = True
        try:
            while has_more:
                resp = await asyncio.to_thread(
                    plaid_client.transactions_sync,
                    TransactionsSyncRequest(access_token=access_token, cursor=cursor),
                )
                added += resp.added
                removed += resp.removed
                cursor = resp.next_cursor
                has_more = resp.has_more
        except plaid.ApiException as e:
            raise _plaid_error(e)

        for t in added:
            if t.pending:
                continue  # import once posted, avoids amount-correction churn
            if t.amount <= 0:
                continue  # Plaid convention: positive = outflow; skip inflow/refunds
            if t.transaction_id in recurring_transaction_ids:
                continue  # already represented as a bill via its recurring stream
            if await db.plaid_transactions.find_one(
                {"user_id": uid, "plaid_transaction_id": t.transaction_id}
            ):
                continue
            primary_cat = t.personal_finance_category.primary if t.personal_finance_category else None
            expense = {
                "id": str(uuid.uuid4()),
                "name": t.merchant_name or t.name,
                "category": PLAID_TO_EXPENSE_CATEGORY.get(primary_cat, "Other"),
                "amount": t.amount,
                "date": t.date.isoformat() if hasattr(t.date, "isoformat") else str(t.date),
                "recurring": False,
                "source": "plaid",
                "user_id": uid,
            }
            try:
                await db.expenses.insert_one(expense)
                await db.plaid_transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": uid,
                    "plaid_item_id": item["item_id"],
                    "plaid_transaction_id": t.transaction_id,
                    "target_collection": "expenses",
                    "target_id": expense["id"],
                    "amount": t.amount,
                    "imported_at": datetime.now(timezone.utc),
                })
                expenses_created += 1
            except DuplicateKeyError:
                # Concurrent sync already imported this transaction -- roll back the
                # orphaned expense doc inserted just above for it.
                await db.expenses.delete_one({"id": expense["id"]})

        for t in removed:
            tracked = await db.plaid_transactions.find_one(
                {"user_id": uid, "plaid_transaction_id": t.transaction_id}
            )
            if tracked and tracked["target_collection"] == "expenses":
                await db.expenses.delete_one({"id": tracked["target_id"], "user_id": uid})
                await db.plaid_transactions.delete_one({"id": tracked["id"]})
                removed_count += 1

        await db.plaid_items.update_one(
            {"id": item["id"]},
            {"$set": {"cursor": cursor, "last_synced_at": datetime.now(timezone.utc), "status": "active"}},
        )

    return {
        "items_synced": len(items),
        "expenses_created": expenses_created,
        "bills_created_or_updated": bills_upserted,
        "removed": removed_count,
    }


@api_router.get("/plaid/status")
async def plaid_status(user: dict = Depends(get_current_user)):
    await _require_premium(user)
    docs = await db.plaid_items.find(
        {"user_id": user["_id"]},
        {"_id": 0, "access_token": 0, "cursor": 0},
    ).to_list(50)
    return {"connected": len(docs) > 0, "items": docs}


@api_router.delete("/plaid/item/{item_id}")
async def plaid_disconnect(item_id: str, user: dict = Depends(get_current_user)):
    await _require_premium(user)
    item = await db.plaid_items.find_one({"item_id": item_id, "user_id": user["_id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Linked account not found")
    try:
        await asyncio.to_thread(
            plaid_client.item_remove,
            ItemRemoveRequest(access_token=item["access_token"]),
        )
    except plaid.ApiException as e:
        logger.warning("Plaid item_remove failed (proceeding with local cleanup): %s", e)
    await db.plaid_items.delete_one({"id": item["id"]})
    # Drop dedup tracking so a future re-link re-imports cleanly instead of silently
    # skipping transactions as "already seen". Previously-imported bills/expenses are
    # left in place -- disconnecting unlinks the pipe, it doesn't delete the user's data.
    await db.plaid_transactions.delete_many({"user_id": user["_id"], "plaid_item_id": item_id})
    return {"disconnected": True}


# ── Investments: Rates, Institutions, Projections, AI Advice ────────

FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
_rates_cache: dict = {"ts": 0, "data": None}
_rates_cache_ttl = 3600  # 1h

# Curated institution reference data (rates updated periodically)
BR_INSTITUTIONS = [
    {"name": "Nubank",          "product": "Caixinha Turbo (CDB)",    "rate_label": "100% CDI",       "rate_pct_cdi": 100, "min_amount": 1,      "liquidity": "daily",      "safety": "FGC",  "url": "https://nubank.com.br/investimentos/", "emoji": "💜"},
    {"name": "BTG Pactual",     "product": "CDB BTG+",                "rate_label": "100–115% CDI",   "rate_pct_cdi": 108, "min_amount": 100,    "liquidity": "daily",      "safety": "FGC",  "url": "https://www.btgpactualdigital.com/",   "emoji": "⚫"},
    {"name": "XP Investimentos","product": "CDB XP",                  "rate_label": "100–118% CDI",   "rate_pct_cdi": 110, "min_amount": 1000,   "liquidity": "on maturity","safety": "FGC",  "url": "https://www.xpi.com.br/",              "emoji": "⭐"},
    {"name": "Itaú",            "product": "CDB DI",                  "rate_label": "95–100% CDI",    "rate_pct_cdi": 98,  "min_amount": 500,    "liquidity": "daily",      "safety": "FGC",  "url": "https://www.itau.com.br/",             "emoji": "🟠"},
    {"name": "Bradesco",        "product": "CDB Bradesco",            "rate_label": "95–102% CDI",    "rate_pct_cdi": 98,  "min_amount": 500,    "liquidity": "daily",      "safety": "FGC",  "url": "https://banco.bradesco/",              "emoji": "🔴"},
]
US_INSTITUTIONS = [
    {"name": "Marcus (Goldman Sachs)", "product": "High-Yield Savings", "rate_label": "4.40% APY", "rate_apy": 4.40, "min_amount": 0,   "liquidity": "daily",          "safety": "FDIC", "url": "https://www.marcus.com/us/en/savings",  "emoji": "🏛️"},
    {"name": "Ally Bank",              "product": "Online Savings",     "rate_label": "4.00% APY", "rate_apy": 4.00, "min_amount": 0,   "liquidity": "daily",          "safety": "FDIC", "url": "https://www.ally.com/bank/online-savings-account/", "emoji": "🅰️"},
    {"name": "SoFi",                   "product": "Savings",            "rate_label": "4.60% APY", "rate_apy": 4.60, "min_amount": 0,   "liquidity": "daily",          "safety": "FDIC", "url": "https://www.sofi.com/banking/",         "emoji": "💙"},
    {"name": "Discover",               "product": "Online Savings",     "rate_label": "3.75% APY", "rate_apy": 3.75, "min_amount": 0,   "liquidity": "daily",          "safety": "FDIC", "url": "https://www.discover.com/online-banking/savings-account/", "emoji": "🟧"},
    {"name": "CIT Bank",               "product": "Platinum Savings",   "rate_label": "4.85% APY", "rate_apy": 4.85, "min_amount": 5000,"liquidity": "daily",          "safety": "FDIC", "url": "https://www.cit.com/cit-bank/bank/platinum-savings", "emoji": "💠"},
]

async def _fetch_bcb_series(http: httpx.AsyncClient, series_id: int) -> Optional[float]:
    """Banco Central do Brasil SGS — series 11=Selic daily, 12=CDI daily, 4189=Selic target annual."""
    try:
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados/ultimos/1?formato=json"
        r = await http.get(url)
        if r.status_code == 200:
            data = r.json()
            if data and isinstance(data, list):
                return float(data[0]["valor"])
    except Exception:
        pass
    return None

async def _fetch_fred_series(http: httpx.AsyncClient, series_id: str) -> Optional[float]:
    """FRED latest observation (e.g., FEDFUNDS, DGS10, DGS5, DGS1)."""
    if not FRED_API_KEY:
        return None
    try:
        r = await http.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 5,
            },
        )
        if r.status_code == 200:
            obs = r.json().get("observations", [])
            for o in obs:
                v = o.get("value")
                if v not in (None, ".", ""):
                    return float(v)
    except Exception:
        pass
    return None


@api_router.get("/investments/rates")
async def investment_rates(user: dict = Depends(get_current_user)):
    """Live benchmark rates from BCB (Brazil) + FRED (USA)."""
    import time
    now = time.time()
    if _rates_cache["data"] and (now - _rates_cache["ts"]) < _rates_cache_ttl:
        return {**_rates_cache["data"], "cached": True}

    br: dict = {}
    us: dict = {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            # Brazil: Selic target (annual), Selic overnight daily, CDI daily, Poupança monthly
            selic_target = await _fetch_bcb_series(http, 4189)   # Selic meta anual %
            cdi_daily    = await _fetch_bcb_series(http, 12)      # CDI over daily %
            # Annualise daily CDI (252 business days)
            cdi_annual = None
            if cdi_daily is not None:
                cdi_annual = ((1 + cdi_daily / 100) ** 252 - 1) * 100
            # Poupança rule: if Selic meta > 8.5% → 0.5%/mo + TR ≈ 6.17%/yr. Otherwise 70% Selic.
            poupanca_annual = 6.17 if (selic_target or 0) > 8.5 else (selic_target or 0) * 0.7
            br = {
                "selic_annual_pct": round(selic_target, 2) if selic_target else None,
                "cdi_annual_pct":   round(cdi_annual, 2)   if cdi_annual  else None,
                "poupanca_annual_pct": round(poupanca_annual, 2) if poupanca_annual else None,
                "ipca_note": "Reference benchmarks from Banco Central do Brasil.",
            }

            # USA: FEDFUNDS (Fed funds effective), DGS1 (1Y), DGS5 (5Y), DGS10 (10Y)
            fed     = await _fetch_fred_series(http, "FEDFUNDS")
            t1y     = await _fetch_fred_series(http, "DGS1")
            t5y     = await _fetch_fred_series(http, "DGS5")
            t10y    = await _fetch_fred_series(http, "DGS10")
            # Average HYSA APY rough = fed_funds - 1.0% (conservative estimate)
            hysa_avg = max(0.5, (fed or 0) - 1.0) if fed else 4.0
            us = {
                "fed_funds_pct": round(fed, 2)  if fed  else None,
                "treasury_1y_pct":  round(t1y, 2)  if t1y  else None,
                "treasury_5y_pct":  round(t5y, 2)  if t5y  else None,
                "treasury_10y_pct": round(t10y, 2) if t10y else None,
                "hysa_avg_pct":     round(hysa_avg, 2),
            }
    except Exception as e:
        logger.exception("Investment rates error")
        # Don't crash — return whatever we have
        br = br or {}
        us = us or {}

    # Fallback sane defaults if APIs gave nothing (API outage)
    if not br.get("cdi_annual_pct"):
        br.setdefault("selic_annual_pct",   10.75)
        br.setdefault("cdi_annual_pct",     10.65)
        br.setdefault("poupanca_annual_pct", 6.17)
        br["fallback"] = True
    if not us.get("fed_funds_pct"):
        us.setdefault("fed_funds_pct",    5.33)
        us.setdefault("treasury_1y_pct",  4.80)
        us.setdefault("treasury_5y_pct",  4.20)
        us.setdefault("treasury_10y_pct", 4.25)
        us.setdefault("hysa_avg_pct",     4.30)
        us["fallback"] = True

    payload = {
        "br": br,
        "us": us,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    _rates_cache["data"] = payload
    _rates_cache["ts"] = now
    return {**payload, "cached": False}


@api_router.get("/investments/institutions")
async def investment_institutions(country: str = "br", user: dict = Depends(get_current_user)):
    c = (country or "br").lower()
    if c == "br":
        return {"country": "BR", "institutions": BR_INSTITUTIONS,
                "safety_note": "All listed Brazilian institutions are FGC-protected up to R$250.000 per CPF per institution."}
    if c == "us":
        return {"country": "US", "institutions": US_INSTITUTIONS,
                "safety_note": "All listed US institutions are FDIC-insured up to $250,000 per depositor per bank."}
    raise HTTPException(status_code=400, detail="country must be 'br' or 'us'")


class ProjectReq(BaseModel):
    initial: float = 0
    monthly: float = 0
    period_months: int = 12
    # Optional — if omitted, backend uses live rates
    scenarios: Optional[dict] = None   # e.g. {"cdb": 11.0, "poupanca": 6.17, "tesouro": 10.5}

@api_router.post("/investments/project")
async def investment_project(data: ProjectReq, user: dict = Depends(get_current_user)):
    if data.period_months <= 0 or data.period_months > 600:
        raise HTTPException(status_code=400, detail="period_months must be between 1 and 600")
    if data.initial < 0 or data.monthly < 0:
        raise HTTPException(status_code=400, detail="Amounts must be non-negative")

    # Get current rates
    try:
        rates_resp = await investment_rates(user)  # reuse cached
    except Exception:
        rates_resp = {"br": {"cdi_annual_pct": 10.65, "poupanca_annual_pct": 6.17},
                      "us": {"treasury_10y_pct": 4.25, "hysa_avg_pct": 4.30}}

    # Build scenarios: 3 lines for each country, merged into one payload.
    # Frontend picks which to display based on user's active tab.
    br = rates_resp.get("br", {})
    us = rates_resp.get("us", {})
    s = data.scenarios or {}
    # Prioritise user-supplied overrides, then live rates, then fallbacks
    cdb_rate       = float(s.get("cdb",      br.get("cdi_annual_pct", 10.65) * 1.05))   # 105% CDI typical
    poupanca_rate  = float(s.get("poupanca", br.get("poupanca_annual_pct", 6.17)))
    tesouro_rate   = float(s.get("tesouro",  br.get("cdi_annual_pct", 10.65)))
    hysa_rate      = float(s.get("hysa",     us.get("hysa_avg_pct", 4.30)))
    savings_rate   = float(s.get("savings",  0.45))                                     # Chase/BOA avg
    ustreasury_rate= float(s.get("ustreasury", us.get("treasury_10y_pct", 4.25)))

    def simulate(annual_pct: float) -> list:
        """Monthly compounding series. Returns list of (month, balance)."""
        r = (1 + annual_pct / 100) ** (1 / 12) - 1
        bal = data.initial
        series = [{"month": 0, "balance": round(bal, 2)}]
        for m in range(1, data.period_months + 1):
            bal = bal * (1 + r) + data.monthly
            series.append({"month": m, "balance": round(bal, 2)})
        return series

    total_invested = data.initial + data.monthly * data.period_months

    def pack(annual: float) -> dict:
        series = simulate(annual)
        final = series[-1]["balance"]
        return {
            "annual_rate_pct": round(annual, 2),
            "series": series,
            "final_amount": round(final, 2),
            "total_invested": round(total_invested, 2),
            "total_earnings": round(final - total_invested, 2),
        }

    return {
        "period_months": data.period_months,
        "total_invested": round(total_invested, 2),
        "br": {
            "cdb":      pack(cdb_rate),
            "tesouro":  pack(tesouro_rate),
            "poupanca": pack(poupanca_rate),
        },
        "us": {
            "hysa":       pack(hysa_rate),
            "ustreasury": pack(ustreasury_rate),
            "savings":    pack(savings_rate),
        },
    }


class AdviceReq(BaseModel):
    country: str = "br"       # "br" or "us"
    goal_name: Optional[str] = None
    goal_amount: Optional[float] = None
    time_horizon_months: Optional[int] = None

@api_router.post("/investments/advice")
async def investment_advice(data: AdviceReq, user: dict = Depends(get_current_user)):
    """AI-generated personalized investment advice using Emergent LLM + user's budget context."""
    uid = user["_id"]
    country = (data.country or "br").lower()

    # Pull user's budget context
    settings = await db.settings.find_one({"user_id": uid}) or {}
    salary = float(settings.get("salary", 0))
    pct_savings = float(settings.get("pctSavings", 20))
    currency = settings.get("currency", "R$" if country == "br" else "$")
    monthly_savings = round(salary * pct_savings / 100, 2)

    # Pull recent expenses to know if they're on-track
    try:
        expenses = await db.expenses.find({"user_id": uid}).sort("date", -1).to_list(100)
        recent_total = sum(float(e.get("amount", 0)) for e in expenses)
    except Exception:
        recent_total = 0

    # Pull live rates
    try:
        rates_resp = await investment_rates(user)
    except Exception:
        rates_resp = {}
    br = rates_resp.get("br", {})
    us = rates_resp.get("us", {})

    # Decide recommendation buckets by amount
    if country == "br":
        benchmark = br.get("cdi_annual_pct", 10.65)
        if monthly_savings < 1000:
            bucket = "Nubank Caixinha Turbo (100% CDI, liquidez diária) ou Tesouro Selic"
        elif monthly_savings < 10000:
            bucket = "CDB BTG+ (105–110% CDI) com liquidez diária"
        else:
            bucket = "Tesouro IPCA+ 2029 ou CDB XP longo prazo para melhor rendimento"
    else:
        benchmark = us.get("hysa_avg_pct", 4.30)
        if monthly_savings < 200:
            bucket = "SoFi or Marcus HYSA (4%+ APY, daily access)"
        elif monthly_savings < 2000:
            bucket = "CIT Platinum (4.85% APY) or 1-year CD"
        else:
            bucket = "Mix of 5Y Treasury + HYSA for liquidity buffer"

    # Compose compact system prompt with context
    ctx = (
        f"User country: {country.upper()}\n"
        f"Monthly net salary: {currency}{salary}\n"
        f"Monthly savings allocation ({pct_savings}%): {currency}{monthly_savings}\n"
        f"Current benchmark rate: {benchmark}% /yr ({'CDI' if country == 'br' else 'HYSA avg'})\n"
        f"Recent expense total tracked: {currency}{recent_total}\n"
        f"Goal: {data.goal_name or '(none)'} — target {currency}{data.goal_amount or 0} in {data.time_horizon_months or 0} months\n"
        f"Suggested bucket: {bucket}\n"
    )

    system = (
        "You are FinBot, a concise, practical personal finance coach for FinFlowAdvisors. "
        "Give 3–5 short, actionable bullet points tailored to the user's country (Brazil uses R$/CDI/Selic/Tesouro; "
        "USA uses $/HYSA/Treasury/CDs). Avoid heavy jargon. NEVER recommend specific stocks or speculative assets. "
        "Focus on safe fixed-income: savings accounts, CDBs (BR), HYSAs/CDs/Treasuries (US). "
        "If the goal is unrealistic given savings rate, say so kindly and suggest adjustments. "
        "End with one short motivational line. Output plain text only, no markdown headers."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
        if not emergent_key:
            return {"advice": f"Based on your {currency}{monthly_savings}/month savings, we suggest: {bucket}.",
                    "bucket": bucket, "monthly_savings": monthly_savings, "fallback": True}
        chat = (
            LlmChat(api_key=emergent_key, session_id=f"invest-advice-{uid}-{country}", system_message=system)
            .with_model("openai", "gpt-4.1-mini")
        )
        reply = await chat.send_message(UserMessage(text=ctx))
        return {
            "advice": reply.strip() if isinstance(reply, str) else str(reply),
            "bucket": bucket,
            "monthly_savings": monthly_savings,
            "currency": currency,
            "benchmark_pct": benchmark,
        }
    except Exception as e:
        logger.exception("Investment advice LLM error")
        return {
            "advice": f"Based on your {currency}{monthly_savings}/month savings, we suggest: {bucket}. "
                      f"Start small, automate the transfer, and let compounding do the work.",
            "bucket": bucket,
            "monthly_savings": monthly_savings,
            "currency": currency,
            "benchmark_pct": benchmark,
            "fallback": True,
        }


# ── Local Export (CSV / XLSX) ───────────────────────────────────────
import io, csv, base64 as _b64
from openpyxl import Workbook

class ExportReq(BaseModel):
    format: str  # "csv" | "xlsx"

@api_router.post("/export/file")
async def generate_export_file(data: ExportReq, user: dict = Depends(get_current_user)):
    fmt = (data.format or "").lower()
    if fmt not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="Unsupported format")

    uid = user["_id"]
    bills = await db.bills.find({"user_id": uid}).to_list(2000)
    expenses = await db.expenses.find({"user_id": uid}).to_list(5000)
    settings = await db.settings.find_one({"user_id": uid}) or {}
    currency = settings.get("currency", "$")

    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename_base = f"FinFlowAdvisors_{today}"

    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Type", "Name", "Category", "Amount", "Date/DueDay", "Recurring"])
        for b in bills:
            w.writerow(["Bill", b.get("name", ""), b.get("category", ""),
                        f"{currency}{b.get('amount', 0):.2f}",
                        f"Day {b.get('dueDay', '')}", "Yes"])
        for e in expenses:
            w.writerow(["Expense", e.get("name", ""), e.get("category", ""),
                        f"{currency}{e.get('amount', 0):.2f}",
                        e.get("date", ""), "Yes" if e.get("isRecurring") else "No"])
        content = buf.getvalue().encode("utf-8")
        return {
            "filename": f"{filename_base}.csv",
            "mime": "text/csv",
            "base64_data": _b64.b64encode(content).decode("ascii"),
            "bills_count": len(bills),
            "expenses_count": len(expenses),
        }

    # xlsx
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Bills"
    ws1.append(["Name", "Category", "Amount", "Due Day"])
    for b in bills:
        ws1.append([b.get("name", ""), b.get("category", ""), b.get("amount", 0), b.get("dueDay", "")])
    ws2 = wb.create_sheet("Expenses")
    ws2.append(["Name", "Category", "Amount", "Date", "Recurring"])
    for e in expenses:
        ws2.append([e.get("name", ""), e.get("category", ""), e.get("amount", 0),
                    e.get("date", ""), "Yes" if e.get("isRecurring") else "No"])
    xbuf = io.BytesIO()
    wb.save(xbuf)
    return {
        "filename": f"{filename_base}.xlsx",
        "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "base64_data": _b64.b64encode(xbuf.getvalue()).decode("ascii"),
        "bills_count": len(bills),
        "expenses_count": len(expenses),
    }


# ── Local Support Tickets ───────────────────────────────────────────

class TicketIn(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    description: str

class ReplyIn(BaseModel):
    message: str

def _gen_ticket_number() -> str:
    # Short readable ticket id, e.g. FF-A1B2C3
    return "FF-" + uuid.uuid4().hex[:6].upper()

async def _require_admin(user: dict):
    if user.get("role") != "admin" and user.get("email") != os.environ.get("ADMIN_EMAIL", "admin@finflow.com").lower():
        raise HTTPException(status_code=403, detail="Admin access required")

@api_router.post("/support/ticket")
async def submit_support_ticket(data: TicketIn):
    if not data.name.strip() or not data.email.strip() or not data.description.strip():
        raise HTTPException(status_code=400, detail="Name, email and description are required")
    now = datetime.now(timezone.utc)
    tnum = _gen_ticket_number()
    # ensure uniqueness
    while await db.support_tickets.find_one({"ticket_number": tnum}):
        tnum = _gen_ticket_number()
    doc = {
        "ticket_number": tnum,
        "name": data.name.strip(),
        "email": data.email.strip().lower(),
        "phone": (data.phone or "").strip(),
        "description": data.description.strip()[:4000],
        "status": "open",
        "replies": [],
        "created_at": now,
        "updated_at": now,
    }
    await db.support_tickets.insert_one(doc)
    return {"ticket_number": tnum, "status": "open", "created_at": now.isoformat()}

@api_router.get("/admin/support/tickets")
async def admin_list_tickets(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    await _require_admin(user)
    q: dict = {}
    if status in ("open", "replied", "closed"):
        q["status"] = status
    docs = await db.support_tickets.find(q).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        out.append({
            "id": str(d["_id"]),
            "ticket_number": d.get("ticket_number", ""),
            "name": d.get("name", ""),
            "email": d.get("email", ""),
            "phone": d.get("phone", ""),
            "description": d.get("description", ""),
            "status": d.get("status", "open"),
            "created_at": (d.get("created_at") or datetime.now(timezone.utc)).isoformat(),
            "replies": d.get("replies", []),
        })
    return {"tickets": out}

@api_router.post("/admin/support/tickets/{ticket_number}/reply")
async def admin_reply_ticket(ticket_number: str, data: ReplyIn, user: dict = Depends(get_current_user)):
    await _require_admin(user)
    msg = (data.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Reply message cannot be empty")
    doc = await db.support_tickets.find_one({"ticket_number": ticket_number})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    now = datetime.now(timezone.utc)
    reply = {"by": "admin", "message": msg[:4000], "at": now.isoformat()}
    await db.support_tickets.update_one(
        {"_id": doc["_id"]},
        {"$push": {"replies": reply}, "$set": {"status": "replied", "updated_at": now}},
    )
    return {"ok": True}

@api_router.post("/admin/support/tickets/{ticket_number}/close")
async def admin_close_ticket(ticket_number: str, user: dict = Depends(get_current_user)):
    await _require_admin(user)
    res = await db.support_tickets.update_one(
        {"ticket_number": ticket_number},
        {"$set": {"status": "closed", "updated_at": datetime.now(timezone.utc)}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True}


# ── App setup ───────────────────────────────────────────────────────

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.plaid_transactions.create_index([("user_id", 1), ("plaid_transaction_id", 1)], unique=True)
    await db.plaid_items.create_index("user_id")
    # seed admin
    ae = os.environ.get("ADMIN_EMAIL", "admin@finflow.com").lower()
    ap = os.environ.get("ADMIN_PASSWORD", "admin123")
    ex = await db.users.find_one({"email": ae})
    if not ex:
        r = await db.users.insert_one({"name": "Admin", "email": ae, "password_hash": hash_password(ap), "role": "admin", "created_at": datetime.now(timezone.utc)})
        await db.settings.insert_one({"user_id": str(r.inserted_id), "salary": 5000, "currency": "$", "pctNeeds": 50, "pctWants": 30, "pctSavings": 20})
    elif not verify_password(ap, ex["password_hash"]):
        await db.users.update_one({"email": ae}, {"$set": {"password_hash": hash_password(ap)}})
    logger.info("Admin seeded")

@app.on_event("shutdown")
async def shutdown():
    client.close()
