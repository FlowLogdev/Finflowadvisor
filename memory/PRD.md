# FinFlow — Personal Finance Tracker

## Overview
FinFlow is a full-featured personal finance tracker built with React Native (Expo) and a FastAPI + MongoDB backend. It helps users track their income, bills, expenses, and savings goals with a clean, minimal UI.

## Tech Stack
- **Frontend**: React Native + Expo (SDK 54), TypeScript, expo-router, react-native-chart-kit
- **Backend**: FastAPI, Motor (async MongoDB driver), Pydantic v2
- **Database**: MongoDB (local)
- **Fonts**: DM Sans (main), DM Mono (numbers/currency)
- **Theme**: Auto light/dark mode based on device system settings (with manual override)

## Screens

### 1. Setup Tab
- Monthly net salary input
- Currency selector: USD $, EUR €, GBP £, BRL R$, CAD C$
- Budget split: Needs %, Wants %, Savings % (default 50/30/20)
- Summary cards showing dollar amount per category

### 2. Bills Tab
- Add/delete recurring monthly bills with due day (1-31)
- Categories: Housing, Utilities, Food, Transport, Health, Insurance, Subscriptions, Education, Other
- Summary: total bills, remaining after bills, bills % of income
- "Due soon" badge for bills due within 3 days

### 3. Expenses Tab
- Add/delete daily expenses with recurring toggle
- Categories: Dining, Groceries, Shopping, Transport, Entertainment, Health, Travel, Personal care, Gifts, Other
- Summary: total, this month, average per entry, count
- Recurring badge and toggle on each expense

### 4. Dashboard Tab
- 4 metric cards: Salary, Total Bills, Total Expenses, Net Left
- Smart tip banner with automatic financial advice
- Budget vs Actual progress bars (Needs/Wants/Savings)
- Pie charts: expenses by category, bills by category
- Spending breakdown list (top 10)
- Cashflow waterfall (Income → Bills → Expenses → Net)
- Savings goals with progress bars
- Navigation to Settings and History screens

### 5. Onboarding Screen
- 3-step welcome flow explaining 50/30/20 rule
- Skip option for returning users
- Stored in AsyncStorage

### 6. Monthly History Screen
- List of past months with income, bills, expenses, net summary
- Tap to see full monthly breakdown

### 7. Month Detail Screen
- Full breakdown: bills, expenses by category
- Export as PDF via share sheet

### 8. App Settings Screen
- Theme toggle: System / Light / Dark
- Currency selector
- Reset all data with confirmation
- App version info

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get current settings |
| PUT | /api/settings | Update settings |
| GET | /api/bills | List all bills |
| POST | /api/bills | Create a bill (with dueDay) |
| DELETE | /api/bills/{id} | Delete a bill |
| GET | /api/expenses | List all expenses |
| POST | /api/expenses | Create an expense (with recurring flag) |
| DELETE | /api/expenses/{id} | Delete an expense |
| PATCH | /api/expenses/{id}/toggle-recurring | Toggle recurring flag |
| GET | /api/savings-goals | List savings goals |
| POST | /api/savings-goals | Create a savings goal |
| PUT | /api/savings-goals/{id} | Update a savings goal |
| DELETE | /api/savings-goals/{id} | Delete a savings goal |
| GET | /api/dashboard | Get aggregated dashboard |
| GET | /api/monthly-history | Get monthly summaries |
| GET | /api/monthly-detail/{month} | Get detailed month view |
| POST | /api/process-recurring | Process recurring expenses for current month |
| POST | /api/reset | Reset all data |
| GET | /api/health | Health check |

## Design System
- Background: #f7f6f2 (light) / #1a1a18 (dark)
- Surface: #ffffff (light) / #2a2a28 (dark)
- Income/positive: #2d5a3d (light) / #43a047 (dark)
- Expenses/negative: #c84b1f (light) / #e57373 (dark)
- Warnings: #b8740a (light) / #ffb74d (dark)
- Savings: #1a4a8a (light) / #64b5f6 (dark)
- 12px border radius, 0.5px borders, flat/clean no shadows
- DM Sans for text, DM Mono for numbers/currency
