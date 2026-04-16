export interface Settings {
  salary: number;
  currency: '$' | '€' | '£' | 'R$' | 'C$';
  pctNeeds: number;
  pctWants: number;
  pctSavings: number;
}

export interface Bill {
  id: string;
  name: string;
  category: string;
  amount: number;
  dueDay?: number;
}

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
}

export interface CategoryAmount {
  name: string;
  amount: number;
  color: string;
}

export interface DashboardData {
  settings: Settings;
  total_bills: number;
  total_expenses: number;
  net_remaining: number;
  bills_by_category: CategoryAmount[];
  expenses_by_category: CategoryAmount[];
  budget_comparison: {
    needs: { target: number; actual: number };
    wants: { target: number; actual: number };
    savings: { target: number; actual: number };
  };
  smart_tip: string;
  savings_goals: SavingsGoal[];
  all_spending: { name: string; category: string; amount: number; type: string }[];
  cashflow: { income: number; bills: number; expenses: number; net: number };
}

export const BILL_CATEGORIES = [
  'Housing', 'Utilities', 'Food', 'Transport', 'Health',
  'Insurance', 'Subscriptions', 'Education', 'Other',
] as const;

export const EXPENSE_CATEGORIES = [
  'Dining', 'Groceries', 'Shopping', 'Transport', 'Entertainment',
  'Health', 'Travel', 'Personal care', 'Gifts', 'Other',
] as const;

export const CURRENCIES = [
  { symbol: '$', label: 'USD $' },
  { symbol: '€', label: 'EUR €' },
  { symbol: '£', label: 'GBP £' },
  { symbol: 'R$', label: 'BRL R$' },
  { symbol: 'C$', label: 'CAD C$' },
] as const;

export const BILL_CATEGORY_COLORS: Record<string, string> = {
  Housing: '#4A90D9', Utilities: '#F5A623', Food: '#7B68EE',
  Transport: '#50C878', Health: '#FF6B6B', Insurance: '#1A4A8A',
  Subscriptions: '#9B59B6', Education: '#3498DB', Other: '#95A5A6',
};

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  Dining: '#FF6B6B', Groceries: '#50C878', Shopping: '#9B59B6',
  Transport: '#F5A623', Entertainment: '#FF69B4', Health: '#3498DB',
  Travel: '#1ABC9C', 'Personal care': '#E67E22', Gifts: '#E74C3C',
  Other: '#95A5A6',
};
