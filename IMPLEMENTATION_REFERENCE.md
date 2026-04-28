# 📋 FinFlow App — Full Implementation Reference

> **Purpose:** Port the features built in the Expo mobile app to the `finflowadvisors.com` web project.
> All endpoints are user-scoped via JWT (`Authorization: Bearer <token>`) unless noted otherwise.

---

## 🔐 1. Account Deletion (Apple Guideline 5.1.1)

### Backend Endpoint
```
DELETE /api/auth/account
Headers: Authorization: Bearer <jwt>
```

**Behavior:** Permanently deletes the authenticated user + all owned data:
- `bills`, `expenses`, `savings_goals`, `settings`
- `ai_messages`, `ai_insights`, `watchlist`
- `support_tickets` (matched by email)
- Then the `users` row last

Returns `{ "deleted": true }`

### Frontend (Web)
- Settings → "Danger Zone" panel → red "Delete Account" button
- Modal: type your email to confirm
- On confirm → call `DELETE /api/auth/account` → clear cookies/localStorage → redirect to `/`

### Reference Python Implementation
```python
@api_router.delete("/auth/account")
async def delete_account(user: dict = Depends(get_current_user)):
    uid = user["_id"]
    await db.bills.delete_many({"user_id": uid})
    await db.expenses.delete_many({"user_id": uid})
    await db.savings_goals.delete_many({"user_id": uid})
    await db.settings.delete_many({"user_id": uid})
    await db.ai_messages.delete_many({"user_id": uid})
    await db.ai_insights.delete_many({"user_id": uid})
    await db.watchlist.delete_many({"user_id": uid})
    await db.support_tickets.delete_many({"email": user.get("email", "").lower()})
    try:
        await db.users.delete_one({"_id": ObjectId(uid)})
    except Exception:
        pass
    return {"deleted": True}
```

---

## 💰 2. Premium Paywall + Subscription Disclaimers (Apple Guideline 3.1.2)

### Frontend Requirements
On `/premium` page, you MUST display:
- Auto-renewable subscription explanation
- Pricing tiers: **$2.49/month** or **$19.99/year**
- "Payment will be charged to Apple ID at confirmation of purchase"
- "Subscription auto-renews unless turned off 24 hrs before end of period"
- "Manage in App Store > Subscriptions"
- Linked **EULA**: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
- Linked **Privacy Policy**: `https://finflowadvisors.com/privacy`

### IAP via RevenueCat (Mobile only — skip on web)
- Product IDs: `finflow_premium_monthly`, `finflow_premium_yearly`
- Entitlement: `FinFlowAdvisors Pro`

---

## 🛡️ 3. Financial Immune Score

### Endpoint
```
GET /api/immune-score
```

### Algorithm — Score 0–100, sum of 3 sub-scores

| Factor | Weight | Formula |
|---|---|---|
| **Emergency Fund** | 35 pts | Months liquid savings cover obligations. ≥6 mo = 35; ≥3 mo = 25→35 linear; ≥1 mo = 12→25 linear; <1 mo = months × 12 |
| **Obligation Ratio** | 35 pts | (bills + recurring) / salary. ≤40% = 35; 40–60% = 25→15; 60–75% = 15→5; 75–90% = 5→1; >90% = 0 |
| **Savings Rate** | 30 pts | net / salary. ≥20% = 30; 15–20% = 22→30; 10–15% = 15→22; 5–10% = 8→15; <5% = 0→8 |

### Levels
- **80+**: "Resilient" (`#43a047`) — "Your finances could weather a major storm."
- **60+**: "Stable" (`#1a4a8a`) — "You have some buffer but vulnerabilities exist."
- **40+**: "Vulnerable" (`#b8740a`) — "A financial shock could strain you significantly."
- **<40**: "At Risk" (`#c84b1f`) — "Immediate attention needed — low resilience."

### Response Shape
```json
{
  "score": 72,
  "level": "Stable",
  "color": "#1a4a8a",
  "description": "You have some buffer but vulnerabilities exist.",
  "factors": {
    "emergency_fund":   {"score": 25, "max": 35, "months_covered": 4.2, "total_liquid": 8400, "label": "Emergency Fund"},
    "obligation_ratio": {"score": 28, "max": 35, "pct": 48.5, "total_obligations": 2425, "label": "Fixed Obligations"},
    "savings_rate":     {"score": 19, "max": 30, "pct": 12.0, "net": 600, "label": "Savings Rate"}
  },
  "tips": [
    "Build emergency fund to cover 3 months ($2,800 more needed)",
    "Savings rate is 12% — target at least 10–20%"
  ],
  "currency": "$"
}
```

---

## ⚰️ 4. Subscription Graveyard

### Endpoints
```
GET   /api/subscription-graveyard
PATCH /api/subscription-graveyard/{sub_id}/toggle-unused
```

### Source Data
- Bills with `category = "Subscriptions"`
- Expenses where `recurring = true`

### Logic
- `months_active` = days since user account was created / 30 (min 1)
- `cumulative_cost` = `monthly_cost × months_active`
- Sort: buried/unused first, then by highest cost

### Response
```json
{
  "subscriptions": [
    {
      "id": "uuid",
      "name": "Netflix",
      "monthly_cost": 19.99,
      "cumulative_cost": 159.92,
      "months_active": 8,
      "marked_unused": true,
      "type": "bill",
      "category": "Subscriptions",
      "is_buried": true
    }
  ],
  "total_monthly": 87.50,
  "total_annual": 1050.00,
  "total_waste_monthly": 19.99,
  "total_waste_annual": 239.88,
  "currency": "$",
  "months_active": 8
}
```

---

## 🔮 5. Future Self Projector

### Endpoint
```
POST /api/future-self
```

### Algorithm
- **Annual return:** 7% (S&P 500 long-term average)
- **Monthly compounding:** `monthly_return = (1.07)^(1/12) - 1`
- Two scenarios:
  - **Current path:** `net_monthly = salary - bills - expenses`
  - **Optimized:** `current + freed_up` where `freed_up = wasted_subs OR 10% × discretionary`
- **Horizons:** 5, 10, 20, 30 years

### Response
```json
{
  "currency": "$",
  "current": {
    "monthly_savings": 600,
    "monthly_spend": 4400,
    "projections": [
      {"years": 5, "balance": 51200, "label": "5yr"},
      {"years": 10, "balance": 124800, "label": "10yr"},
      {"years": 20, "balance": 374100, "label": "20yr"},
      {"years": 30, "balance": 845200, "label": "30yr"}
    ]
  },
  "optimized": {
    "monthly_savings": 850,
    "monthly_spend": 4150,
    "monthly_freed": 250,
    "projections": [/* ... */]
  },
  "assumptions": {
    "annual_return_pct": 7.0,
    "starting_balance": 8400,
    "optimization_source": "subscription_cleanup"
  }
}
```

---

## 📊 6. Investments Tab — Live Rates

### Endpoint
```
GET /api/investments/rates    # cached 1 hour
```

### Brazil — BCB SGS (NO API key)
| Series ID | Endpoint | Notes |
|---|---|---|
| 4189 | Selic meta annual % | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4189/dados/ultimos/1?formato=json` |
| 12 | CDI daily % | Annualize via `(1 + d/100)^252 - 1` |
| Computed | Poupança | If Selic > 8.5% → 6.17%/yr; else `Selic × 0.7` |

### USA — FRED API (free key required)
| Series ID | What | Endpoint |
|---|---|---|
| `FEDFUNDS` | Fed funds rate | `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=KEY&file_type=json&sort_order=desc&limit=5` |
| `DGS1` | 1-yr Treasury | same pattern |
| `DGS5` | 5-yr Treasury | |
| `DGS10` | 10-yr Treasury | |
| HYSA est. | `max(0.5, fed_funds - 1.0)` | computed |

### Other Endpoints
- `GET /api/investments/institutions` — curated bank list (Nubank, BTG, XP, Itaú, Bradesco, Marcus, Ally, SoFi, Discover, CIT)
- `POST /api/investments/project` — compound projection
- `POST /api/investments/advice` — LLM-powered

---

## 💱 7. Live FX Rates (Frankfurter — Free, No Key)

### Endpoint
```
GET /api/markets/fx    # cached 15 min
```

### Source
```
https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL,EUR,GBP
```

### Default Pairs
- USD/BRL, USD/EUR, EUR/USD, USD/GBP, GBP/USD, EUR/BRL

### Used In
- Markets / Watchlist UI
- AI Advisor LLM context (so the bot can answer "how is the dollar today?")

---

## 📈 8. Stocks Watchlist (Finnhub — free key)

### Endpoints
```
GET    /api/markets/stocks?symbols=AAPL,MSFT,GOOGL
GET    /api/watchlist
POST   /api/watchlist          { symbol: "AAPL" }
DELETE /api/watchlist/{symbol}
```

### Source
```
https://finnhub.io/api/v1/quote?symbol=AAPL&token=KEY
```
Returns: `{c: current, d: diff, dp: diffPct, h, l, pc}`

---

## 🤖 9. AI Money Advisor (LLM Chat)

### Endpoints
```
POST   /api/ai-advisor/chat       { message, session_id?, language? }
GET    /api/ai-advisor/history
DELETE /api/ai-advisor/history
GET    /api/ai-advisor/insight    # daily personalized tip
```

### Provider
- OpenAI `gpt-4.1-mini` via Emergent LLM Key
- Library: `emergentintegrations.llm.chat.LlmChat`

### Context Injected into System Prompt
- Salary, currency, 50/30/20 split
- Top 10 recurring bills
- Current month expenses + top 5 categories
- Live FX rates (USD/BRL, USD/EUR, etc.)
- Computed metrics: bills ratio, daily burn rate, discretionary runway in days

### Multilingual
- `en`, `es`, `pt-BR` — directive appended to system prompt

---

## 📄 10. CSV/Excel Export (Local — No Email Service)

### Endpoint
```
POST /api/export/file
Body: { "format": "csv" | "xlsx" }
```

### Response (Base64-encoded file)
```json
{
  "filename": "FinFlowAdvisors_20260427.csv",
  "mime": "text/csv",
  "base64_data": "VHlwZSxOYW1lLENhdGVnb3J5...",
  "bills_count": 12,
  "expenses_count": 47
}
```

### Frontend (Web)
```js
const r = await api.post('/api/export/file', { format: 'csv' });
const blob = new Blob(
  [Uint8Array.from(atob(r.data.base64_data), c => c.charCodeAt(0))],
  { type: r.data.mime }
);
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = r.data.filename; a.click();
URL.revokeObjectURL(url);
```

### CSV Columns
`Type, Name, Category, Amount, Date/DueDay, Recurring`

### XLSX Sheets
- **Bills:** Name, Category, Amount, Due Day
- **Expenses:** Name, Category, Amount, Date, Recurring

---

## 🎫 11. Local Support Ticket System

### Public Endpoint
```
POST /api/support/ticket
Body: { name, email, phone?, description }
Returns: { ticket_number: "FF-A1B2C3", status: "open", created_at }
```
*(No auth required — public submission)*

### Admin Endpoints (require `role=admin`)
```
GET  /api/admin/support/tickets?status=open|replied|closed
POST /api/admin/support/tickets/{ticket_number}/reply   { message }
POST /api/admin/support/tickets/{ticket_number}/close
```

### Status Flow
`open → replied → closed`

### Replies Schema
```js
replies: [{ by: "admin" | "user", message, at: ISO }]
```

---

## 🌐 12. Multi-Language i18n

- Languages: `en`, `es`, `pt-BR`
- Stored in `settings.language`
- Frontend uses translation dictionary
- Backend uses it for AI responses

---

## 🗂️ 13. Standard Endpoints (Pre-Existing — Reference)

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/refresh
GET    /api/health

GET    /api/dashboard
GET    /api/monthly-history
GET    /api/monthly-detail/{month}
POST   /api/process-recurring
POST   /api/reset

GET    /api/settings
PUT    /api/settings

GET    /api/bills
POST   /api/bills
DELETE /api/bills/{id}

GET    /api/expenses
POST   /api/expenses
DELETE /api/expenses/{id}
PATCH  /api/expenses/{id}/toggle-recurring

GET    /api/savings-goals
POST   /api/savings-goals
PUT    /api/savings-goals/{id}
DELETE /api/savings-goals/{id}

GET    /api/insights        # smart financial tips
POST   /api/scenario        # what-if simulator
```

---

## 🗃️ 14. MongoDB Schema Reference

```javascript
users           { _id, name, email, password_hash, role, created_at }
settings        { user_id, salary, currency, language, pctNeeds, pctWants, pctSavings }
bills           { id (uuid), user_id, name, category, amount, dueDay, marked_unused, last_used_date }
expenses        { id (uuid), user_id, name, category, amount, date, recurring, isRecurring, marked_unused }
savings_goals   { id, user_id, name, target, saved }
ai_messages     { user_id, session_id, role, content, ts }
ai_insights     { user_id, content, generated_at }
watchlist       { user_id, symbol, created_at }
support_tickets { ticket_number, name, email, phone, description, status, replies[], created_at, updated_at }
```

---

## 🔑 15. Environment Variables

```bash
# Backend (.env)
MONGO_URL=mongodb://...
DB_NAME=finflow
JWT_SECRET=<random 32+ chars>
ADMIN_EMAIL=admin@finflowadvisors.com
ADMIN_PASSWORD=FinFlow2026!
EMERGENT_LLM_KEY=<from emergent profile>
FRED_API_KEY=<free: fred.stlouisfed.org/docs/api/api_key.html>
FINNHUB_API_KEY=<free: finnhub.io/register>
```

---

## 📦 16. Backend Dependencies (Python)

```
fastapi
motor                    # async MongoDB
openpyxl                 # Excel export
emergentintegrations     # LLM chat
httpx                    # async HTTP for BCB/FRED/Frankfurter/Finnhub
bcrypt
passlib
python-jose              # JWT
python-dotenv
pydantic
```

---

## 🎨 17. Frontend Dependencies (Web)

For your Next.js / React web port, you'll likely want:
```
react, next
recharts                 # charts (instead of react-native-chart-kit)
react-hook-form
zod                      # validation
tailwindcss              # or your styling solution
```

---

## 🚀 Recommended Porting Order

1. **Account Deletion** — Apple compliance (~30 min)
2. **EULA + Subscription disclaimer** — Apple compliance
3. **Immune Score** — high-impact visual feature
4. **Future Self Projector** — emotionally compelling
5. **Investments tab** — needs FRED API key
6. **Subscription Graveyard**
7. **CSV/Excel Export**
8. **Local support ticket system**

---

## 🎨 Brand Color Palette

```
Primary green:  #2d5a3d
Primary red:    #c84b1f
Warning orange: #b8740a
Stable blue:    #1a4a8a
Resilient:      #43a047
Background:     #f5f1e8 (cream) / #1a1a1a (dark)
Text dark:      #2d2d2d
Text muted:     #666666
```

---

*Generated 2026-04-27. See `/app/migrations/` for the Mongo migration script and `/app/web_examples/` for React component examples.*
