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
    expenses = await db.expenses.find({"user_id": uid}, {"_id": 0, "user_id": 0}).to_list(10000)
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
    expenses = await db.expenses.find({"user_id": uid, "date": {"$regex": f"^{month}"}}, {"_id": 0, "user_id": 0}).to_list(10000)
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
