from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os, logging, uuid, bcrypt, jwt
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

    # Add forecast / risk / personality from insights if available
    smart_context = ""
    try:
        # Reuse insights logic by querying fresh data — already have it above
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

    return f"""USER FINANCIAL SNAPSHOT (current month: {now.strftime('%B %Y')}):

Monthly Net Salary: {currency}{salary:.2f}
Currency: {currency}
Budget Split Target: {pct_needs}% Needs / {pct_wants}% Wants / {pct_savings}% Savings

RECURRING BILLS (total {currency}{total_bills:.2f}/mo):
{bill_lines}

THIS MONTH'S EXPENSES SO FAR (total {currency}{total_expenses:.2f}):
Top categories:
{cat_lines}

Remaining disposable after bills: {currency}{max(salary - total_bills, 0):.2f}{smart_context}
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
- Never give legal, tax, or investment-advice disclaimers unless the user asks specifically about investing/taxes."""

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

    # Parse expense dates robustly
    def parse_date(s):
        try:
            return datetime.fromisoformat(s.replace('Z', '+00:00')) if isinstance(s, str) else s
        except Exception:
            return None

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
        try:
            return datetime.fromisoformat(s.replace('Z', '+00:00')) if isinstance(s, str) else s
        except Exception:
            return None

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


# ── App setup ───────────────────────────────────────────────────────

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
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
