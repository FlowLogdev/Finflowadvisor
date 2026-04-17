from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ── Models ──────────────────────────────────────────────────────────

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

class Bill(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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

class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    amount: float
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    recurring: bool = False

class SavingsGoalCreate(BaseModel):
    name: str
    target: float
    saved: float = 0

class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target: Optional[float] = None
    saved: Optional[float] = None

class SavingsGoal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    target: float
    saved: float = 0


# ── Settings ────────────────────────────────────────────────────────

@api_router.get("/settings")
async def get_settings():
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        default = Settings().model_dump()
        await db.settings.insert_one(default.copy())
        return default
    return settings

@api_router.put("/settings")
async def update_settings(data: Settings):
    d = data.model_dump()
    await db.settings.update_one({}, {"$set": d}, upsert=True)
    return d


# ── Bills ───────────────────────────────────────────────────────────

@api_router.get("/bills")
async def get_bills():
    return await db.bills.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/bills")
async def create_bill(data: BillCreate):
    bill = Bill(**data.model_dump())
    d = bill.model_dump()
    await db.bills.insert_one(d.copy())
    return d

@api_router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str):
    result = await db.bills.delete_one({"id": bill_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
    return {"deleted": True}


# ── Expenses ────────────────────────────────────────────────────────

@api_router.get("/expenses")
async def get_expenses():
    return await db.expenses.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/expenses")
async def create_expense(data: ExpenseCreate):
    d = data.model_dump()
    if not d.get("date"):
        d["date"] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    expense = Expense(**d)
    final = expense.model_dump()
    await db.expenses.insert_one(final.copy())
    return final

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"deleted": True}

@api_router.patch("/expenses/{expense_id}/toggle-recurring")
async def toggle_recurring(expense_id: str):
    exp = await db.expenses.find_one({"id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    new_val = not exp.get("recurring", False)
    await db.expenses.update_one({"id": expense_id}, {"$set": {"recurring": new_val}})
    exp["recurring"] = new_val
    return exp


# ── Savings Goals ───────────────────────────────────────────────────

@api_router.get("/savings-goals")
async def get_savings_goals():
    return await db.savings_goals.find({}, {"_id": 0}).to_list(1000)

@api_router.post("/savings-goals")
async def create_savings_goal(data: SavingsGoalCreate):
    goal = SavingsGoal(**data.model_dump())
    d = goal.model_dump()
    await db.savings_goals.insert_one(d.copy())
    return d

@api_router.put("/savings-goals/{goal_id}")
async def update_savings_goal(goal_id: str, data: SavingsGoalUpdate):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.savings_goals.update_one({"id": goal_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    goal = await db.savings_goals.find_one({"id": goal_id}, {"_id": 0})
    return goal

@api_router.delete("/savings-goals/{goal_id}")
async def delete_savings_goal(goal_id: str):
    result = await db.savings_goals.delete_one({"id": goal_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return {"deleted": True}


# ── Dashboard ───────────────────────────────────────────────────────

BILL_CATEGORY_COLORS = {
    'Housing': '#4A90D9', 'Utilities': '#F5A623', 'Food': '#7B68EE',
    'Transport': '#50C878', 'Health': '#FF6B6B', 'Insurance': '#1A4A8A',
    'Subscriptions': '#9B59B6', 'Education': '#3498DB', 'Other': '#95A5A6',
}
EXPENSE_CATEGORY_COLORS = {
    'Dining': '#FF6B6B', 'Groceries': '#50C878', 'Shopping': '#9B59B6',
    'Transport': '#F5A623', 'Entertainment': '#FF69B4', 'Health': '#3498DB',
    'Travel': '#1ABC9C', 'Personal care': '#E67E22', 'Gifts': '#E74C3C',
    'Other': '#95A5A6',
}

@api_router.get("/dashboard")
async def get_dashboard():
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        settings = Settings().model_dump()
    bills = await db.bills.find({}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(1000)
    savings_goals = await db.savings_goals.find({}, {"_id": 0}).to_list(1000)

    total_bills = sum(b["amount"] for b in bills)
    total_expenses = sum(e["amount"] for e in expenses)
    salary = settings.get("salary", 0)
    net_remaining = salary - total_bills - total_expenses

    bills_by_cat: dict = {}
    for b in bills:
        c = b["category"]
        bills_by_cat[c] = bills_by_cat.get(c, 0) + b["amount"]
    expenses_by_cat: dict = {}
    for e in expenses:
        c = e["category"]
        expenses_by_cat[c] = expenses_by_cat.get(c, 0) + e["amount"]

    pn = settings.get("pctNeeds", 50)
    pw = settings.get("pctWants", 30)
    ps = settings.get("pctSavings", 20)
    needs_target = salary * pn / 100
    wants_target = salary * pw / 100
    savings_target = salary * ps / 100

    if salary == 0:
        smart_tip = "Set up your monthly salary in the Setup tab to get started!"
    elif net_remaining < 0:
        smart_tip = "You're spending more than you earn! Review your bills and expenses to find areas to cut back."
    elif total_bills > salary * 0.5:
        smart_tip = "Your bills take up more than 50% of income. Look for ways to reduce fixed costs."
    elif total_expenses > salary * 0.3:
        smart_tip = "Discretionary spending is above 30%. The 50/30/20 rule suggests keeping wants under 30%."
    elif max(net_remaining, 0) >= savings_target > 0:
        smart_tip = "You're on track with savings! Consider increasing your goals or starting investments."
    elif len(bills) == 0 and len(expenses) == 0:
        smart_tip = "Start by adding your monthly bills and daily expenses to see your financial picture."
    else:
        smart_tip = "You're managing finances well! Keep tracking to maintain healthy habits."

    all_spending = sorted(
        [{"name": b["name"], "category": b["category"], "amount": b["amount"], "type": "bill"} for b in bills] +
        [{"name": e["name"], "category": e["category"], "amount": e["amount"], "type": "expense"} for e in expenses],
        key=lambda x: x["amount"], reverse=True,
    )

    return {
        "settings": settings,
        "total_bills": total_bills,
        "total_expenses": total_expenses,
        "net_remaining": net_remaining,
        "bills_by_category": [
            {"name": k, "amount": v, "color": BILL_CATEGORY_COLORS.get(k, '#95A5A6')}
            for k, v in bills_by_cat.items()
        ],
        "expenses_by_category": [
            {"name": k, "amount": v, "color": EXPENSE_CATEGORY_COLORS.get(k, '#95A5A6')}
            for k, v in expenses_by_cat.items()
        ],
        "budget_comparison": {
            "needs": {"target": needs_target, "actual": total_bills},
            "wants": {"target": wants_target, "actual": total_expenses},
            "savings": {"target": savings_target, "actual": max(net_remaining, 0)},
        },
        "smart_tip": smart_tip,
        "savings_goals": savings_goals,
        "all_spending": all_spending,
        "cashflow": {
            "income": salary, "bills": total_bills,
            "expenses": total_expenses, "net": net_remaining,
        },
    }


# ── Monthly History ─────────────────────────────────────────────────

@api_router.get("/monthly-history")
async def get_monthly_history():
    settings = await db.settings.find_one({}, {"_id": 0})
    salary = settings.get("salary", 0) if settings else 0
    currency = settings.get("currency", "$") if settings else "$"
    bills = await db.bills.find({}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(10000)
    total_bills = sum(b["amount"] for b in bills)

    months: dict = {}
    for e in expenses:
        m = e["date"][:7]
        if m not in months:
            months[m] = {"total": 0, "count": 0}
        months[m]["total"] += e["amount"]
        months[m]["count"] += 1

    # include current month even if no expenses
    cur = datetime.now(timezone.utc).strftime('%Y-%m')
    if cur not in months:
        months[cur] = {"total": 0, "count": 0}

    result = []
    for m in sorted(months.keys(), reverse=True):
        d = months[m]
        result.append({
            "month": m, "salary": salary, "currency": currency,
            "bills": total_bills, "expenses": d["total"],
            "expense_count": d["count"],
            "net": salary - total_bills - d["total"],
        })
    return result


@api_router.get("/monthly-detail/{month}")
async def get_monthly_detail(month: str):
    settings = await db.settings.find_one({}, {"_id": 0})
    salary = settings.get("salary", 0) if settings else 0
    currency = settings.get("currency", "$") if settings else "$"
    bills = await db.bills.find({}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find(
        {"date": {"$regex": f"^{month}"}}, {"_id": 0}
    ).to_list(10000)

    total_bills = sum(b["amount"] for b in bills)
    total_expenses = sum(e["amount"] for e in expenses)

    exp_by_cat: dict = {}
    for e in expenses:
        exp_by_cat[e["category"]] = exp_by_cat.get(e["category"], 0) + e["amount"]
    bill_by_cat: dict = {}
    for b in bills:
        bill_by_cat[b["category"]] = bill_by_cat.get(b["category"], 0) + b["amount"]

    return {
        "month": month, "salary": salary, "currency": currency,
        "total_bills": total_bills, "total_expenses": total_expenses,
        "net": salary - total_bills - total_expenses,
        "expenses": expenses, "bills": bills,
        "expenses_by_category": [{"name": k, "amount": v} for k, v in exp_by_cat.items()],
        "bills_by_category": [{"name": k, "amount": v} for k, v in bill_by_cat.items()],
    }


# ── Recurring Expenses Processing ──────────────────────────────────

@api_router.post("/process-recurring")
async def process_recurring():
    settings = await db.settings.find_one({}, {"_id": 0})
    last_processed = settings.get("lastRecurringMonth") if settings else None
    current_month = datetime.now(timezone.utc).strftime('%Y-%m')

    if last_processed == current_month:
        return {"processed": False, "created": 0}

    recurring = await db.expenses.find({"recurring": True}, {"_id": 0}).to_list(1000)
    new_date = datetime.now(timezone.utc).strftime('%Y-%m-01')
    created = 0
    for exp in recurring:
        # don't duplicate if already created this month
        exists = await db.expenses.find_one({
            "name": exp["name"], "category": exp["category"],
            "recurring": True, "date": {"$regex": f"^{current_month}"}
        })
        if exists:
            continue
        new_exp = Expense(
            name=exp["name"], category=exp["category"],
            amount=exp["amount"], date=new_date,
        )
        d = new_exp.model_dump()
        d["recurring"] = True
        await db.expenses.insert_one(d.copy())
        created += 1

    await db.settings.update_one({}, {"$set": {"lastRecurringMonth": current_month}}, upsert=True)
    return {"processed": True, "created": created}


# ── Reset All Data ──────────────────────────────────────────────────

@api_router.post("/reset")
async def reset_all_data():
    await db.settings.delete_many({})
    await db.bills.delete_many({})
    await db.expenses.delete_many({})
    await db.savings_goals.delete_many({})
    return {"reset": True}


# ── Health ──────────────────────────────────────────────────────────

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}


# ── App setup ───────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
