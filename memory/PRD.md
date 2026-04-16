# FinFlow — Personal Finance Tracker

## Overview
FinFlow is a personal finance tracker built with React Native (Expo) and a FastAPI + MongoDB backend. It helps users track their income, bills, expenses, and savings goals with a clean, minimal UI.

## Tech Stack
- **Frontend**: React Native + Expo (SDK 54), TypeScript, expo-router, react-native-chart-kit
- **Backend**: FastAPI, Motor (async MongoDB driver), Pydantic v2
- **Database**: MongoDB (local)
- **Fonts**: DM Sans (main), DM Mono (numbers/currency)
- **Theme**: Auto light/dark mode based on device system settings

## Screens

### 1. Setup Tab
- Monthly net salary input
- Currency selector: USD $, EUR €, GBP £, BRL R$, CAD C$
- Budget split: Needs %, Wants %, Savings % (default 50/30/20)
- Summary cards showing dollar amount per category

### 2. Bills Tab
- Add/delete recurring monthly bills
- Each bill: name, category (Housing, Utilities, Food, Transport, Health, Insurance, Subscriptions, Education, Other), amount
- Summary: total bills, remaining after bills, bills % of income

### 3. Expenses Tab
- Add/delete daily expenses
- Each expense: description, category (Dining, Groceries, Shopping, Transport, Entertainment, Health, Travel, Personal care, Gifts, Other), amount, date
- Summary: total expenses, this month total, average per entry, count

### 4. Dashboard Tab
- 4 metric cards: Salary, Total Bills, Total Expenses, Net Left (green/red)
- Smart tip banner with automatic financial advice
- Budget vs Actual progress bars (Needs/Wants/Savings)
- Pie chart: expenses by category
- Pie chart: bills by category
- Spending breakdown list (top 10 by amount)
- Cashflow waterfall (Income → Bills → Expenses → Net)
- Savings goals with progress bars (add/delete)

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get current settings |
| PUT | /api/settings | Update settings |
| GET | /api/bills | List all bills |
| POST | /api/bills | Create a bill |
| DELETE | /api/bills/{id} | Delete a bill |
| GET | /api/expenses | List all expenses |
| POST | /api/expenses | Create an expense |
| DELETE | /api/expenses/{id} | Delete an expense |
| GET | /api/savings-goals | List savings goals |
| POST | /api/savings-goals | Create a savings goal |
| PUT | /api/savings-goals/{id} | Update a savings goal |
| DELETE | /api/savings-goals/{id} | Delete a savings goal |
| GET | /api/dashboard | Get aggregated dashboard |
| GET | /api/health | Health check |

## Design System
- Background: #f7f6f2 (light) / #1a1a18 (dark)
- Surface: #ffffff (light) / #2a2a28 (dark)
- Income/positive: #2d5a3d (light) / #43a047 (dark)
- Expenses/negative: #c84b1f (light) / #e57373 (dark)
- Warnings: #b8740a (light) / #ffb74d (dark)
- Savings: #1a4a8a (light) / #64b5f6 (dark)
- 12px border radius, 0.5px borders, flat/clean no shadows

## Planned Features (Backlog)
- Onboarding flow (50/30/20 rule explanation, 3-step setup)
- Monthly history tracking
- App settings (reset data, manual theme toggle)
- Export reports (PDF/CSV)
- Bill reminders (push notifications)
- Recurring expense templates
