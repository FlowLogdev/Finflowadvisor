# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FinFlowAdvisors is a personal finance mobile app with an AI financial advisor. The stack is:

- **Backend**: Python FastAPI + Motor (async MongoDB driver), single file at `backend/server.py`
- **Frontend**: React Native + Expo (file-based routing via expo-router), TypeScript

## Environment Setup

### Backend

Create `backend/.env` with:
```
MONGO_URL=<mongodb connection string>
DB_NAME=<database name>
JWT_SECRET=<secret>
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<admin password>
EMERGENT_LLM_KEY=<key for AI advisor via emergentintegrations>
FINNHUB_API_KEY=<key for stock quotes>
FRED_API_KEY=<key for US interest rate data>
```

Run the backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload
```

### Frontend

Create `frontend/.env` with:
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

Run the frontend (uses yarn):
```bash
cd frontend
yarn install
yarn start          # Expo dev server
yarn android        # Android
yarn ios            # iOS
yarn web            # Web
yarn lint           # ESLint via expo lint
```

## Running Tests

Backend tests hit a live server — set `EXPO_PUBLIC_BACKEND_URL` before running:

```bash
cd backend
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 pytest tests/
# Run a single test file:
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 pytest tests/test_backend_api.py
# Run a single test:
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 pytest tests/test_backend_api.py::TestHealth::test_health_check
```

## Architecture

### Backend (`backend/server.py`)

All backend code lives in a single FastAPI file. Routes are mounted under `/api` via `APIRouter`. MongoDB collections used:

| Collection | Purpose |
|---|---|
| `users` | Accounts (bcrypt password, JWT auth) |
| `settings` | Per-user salary, currency, 50/30/20 budget split |
| `bills` | Recurring monthly bills |
| `expenses` | One-off and recurring expenses |
| `savings_goals` | Named savings targets |
| `ai_messages` | AI advisor chat history |
| `ai_insights` | Daily AI-generated money tips (cached by date) |
| `watchlist` | User's stock watchlist |
| `support_tickets` | In-app support system |

**Auth**: JWT tokens (access 24h, refresh 7d). All protected routes use `Depends(get_current_user)`. Token is sent as `Authorization: Bearer <token>` header. Admin routes additionally call `_require_admin()`.

**AI Advisor**: Uses `emergentintegrations` (`LlmChat`) with `openai/gpt-4.1-mini`. Financial context is built fresh on each request from the user's live DB data and injected into the system prompt.

**External APIs**:
- FX rates: Frankfurter.dev (free, no key)
- Stock quotes: Finnhub (`FINNHUB_API_KEY`)
- Brazil rates (Selic/CDI): Banco Central do Brasil SGS API (no key)
- US rates: FRED (`FRED_API_KEY`)
- All external data is in-memory cached with short TTLs

### Frontend (`frontend/`)

File-based routing with expo-router. Route tree:

```
app/
  index.tsx          — auth gate (redirects to landing or tabs)
  landing.tsx        — marketing splash
  login.tsx / register.tsx
  onboarding.tsx
  (tabs)/            — bottom tab navigator
    setup.tsx        — salary/currency/budget settings + savings goals
    bills.tsx
    expenses.tsx
    dashboard.tsx    — charts, budget comparison, smart tip
    advisor.tsx      — AI chat
    investments.tsx  — rates, projections, watchlist
  history.tsx        — monthly history (modal)
  month-detail.tsx   — drill-down for a month (modal)
  settings.tsx       — app settings: theme, language (modal)
  simulator.tsx      — scenario planner
  support.tsx        — support ticket form
  admin-tickets.tsx  — admin ticket management
```

**Key modules in `frontend/src/`**:

- `api.ts` — all REST calls to the backend; reads `EXPO_PUBLIC_BACKEND_URL`; injects Bearer token automatically
- `auth.ts` — `AuthProvider` + `getToken()`; token stored in AsyncStorage under `finflow_token`
- `theme.ts` — `ThemeProvider`, `useTheme()`, `useThemeColors()`; supports `system/light/dark`; persisted in AsyncStorage
- `i18n.ts` — `I18nProvider`, `useI18n()`, `t()`; supports `en`, `es`, `pt-BR`; locale persisted in AsyncStorage
- `types.ts` — shared TypeScript types

**Design system** (from `design_guidelines.json`):
- Fonts: DM Sans for text, DM Mono for all numbers/currency
- Flat UI: no shadows/elevation, 0.5px borders, 12px card border radius
- Colors: `income` green, `expense` orange-red, `savings` blue, `warning` amber — use `useThemeColors()` to get theme-aware values
- `react-native-chart-kit` for all charts

**Component conventions**:
- Interactive elements carry `testID` props for test automation
- All currency/number display must use DM Mono font family
- The bottom tab bar has 6 tabs: Setup, Bills, Expenses, Dashboard, Advisor, Investments
