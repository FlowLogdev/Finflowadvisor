# FinFlow — Personal Finance Tracker (finflowadvisors.com)

## Overview
FinFlow is a full-featured personal finance tracker with a shared backend serving both a mobile app (iOS/Android via Expo) and a web dashboard at finflowadvisors.com. Users authenticate to access their personal data across devices.

## Tech Stack
- **Frontend**: React Native + Expo (SDK 54), TypeScript, expo-router, react-native-chart-kit
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic v2, JWT auth (bcrypt + PyJWT)
- **Database**: MongoDB (Atlas in production)
- **Fonts**: DM Sans (main), DM Mono (numbers/currency)
- **Theme**: Auto light/dark mode with manual override

## Authentication
- JWT Bearer token auth (24h access, 7d refresh)
- Bcrypt password hashing
- Admin seeded on startup (admin@finflow.com / admin123)
- All data endpoints require auth and are user-scoped
- Tokens stored in AsyncStorage (mobile + web)

## Screens

### Public (no auth)
1. **Landing Page** — Marketing page for finflowadvisors.com with feature showcase, 50/30/20 stats, CTAs
2. **Login** — Email/password login with FinFlow logo
3. **Register** — Name/email/password signup

### Authenticated (requires login)
4. **Setup Tab** — Salary, currency, budget split config with logo + theme toggle
5. **Bills Tab** — CRUD bills with categories, due day, "due soon" badges
6. **Expenses Tab** — CRUD expenses with categories, recurring toggle
7. **Dashboard Tab** — Metrics, charts, smart tips, savings goals, logout button
8. **Onboarding** — 50/30/20 rule intro (first login)
9. **Settings Modal** — Theme, currency, reset data, version
10. **Monthly History** — Past month summaries with detail view
11. **Month Detail** — Full breakdown with PDF export

## API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register new user |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | Yes | Get current user |
| POST | /api/auth/refresh | No | Refresh access token |
| GET | /api/settings | Yes | Get user settings |
| PUT | /api/settings | Yes | Update settings |
| GET/POST/DELETE | /api/bills | Yes | CRUD bills |
| GET/POST/DELETE | /api/expenses | Yes | CRUD expenses |
| PATCH | /api/expenses/{id}/toggle-recurring | Yes | Toggle recurring |
| GET/POST/PUT/DELETE | /api/savings-goals | Yes | CRUD goals |
| GET | /api/dashboard | Yes | Aggregated dashboard |
| GET | /api/monthly-history | Yes | Monthly summaries |
| GET | /api/monthly-detail/{month} | Yes | Month detail |
| POST | /api/process-recurring | Yes | Process recurring expenses |
| POST | /api/reset | Yes | Reset user data |
| GET | /api/health | No | Health check |
