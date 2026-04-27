import { getToken } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function resolveToken(): Promise<string | null> {
  // Prefer in-memory (fast path after login)
  const t = getToken();
  if (t) return t;
  // Fallback: read from AsyncStorage (handles direct page navigation / reload before AuthProvider hydrates)
  try {
    return await AsyncStorage.getItem('finflow_token');
  } catch {
    return null;
  }
}

async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await resolveToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers, ...options });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json();
}

export const getSettings = () => api('/api/settings');
export const updateSettings = (data: any) => api('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
export const getBills = () => api('/api/bills');
export const createBill = (data: any) => api('/api/bills', { method: 'POST', body: JSON.stringify(data) });
export const deleteBill = (id: string) => api(`/api/bills/${id}`, { method: 'DELETE' });
export const getExpenses = () => api('/api/expenses');
export const createExpense = (data: any) => api('/api/expenses', { method: 'POST', body: JSON.stringify(data) });
export const deleteExpense = (id: string) => api(`/api/expenses/${id}`, { method: 'DELETE' });
export const toggleRecurring = (id: string) => api(`/api/expenses/${id}/toggle-recurring`, { method: 'PATCH' });
export const getSavingsGoals = () => api('/api/savings-goals');
export const createSavingsGoal = (data: any) => api('/api/savings-goals', { method: 'POST', body: JSON.stringify(data) });
export const updateSavingsGoal = (id: string, data: any) => api(`/api/savings-goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSavingsGoal = (id: string) => api(`/api/savings-goals/${id}`, { method: 'DELETE' });
export const getDashboard = () => api('/api/dashboard');
export const getMonthlyHistory = () => api('/api/monthly-history');
export const getMonthlyDetail = (month: string) => api(`/api/monthly-detail/${month}`);
export const processRecurring = () => api('/api/process-recurring', { method: 'POST' });
export const resetAllData = () => api('/api/reset', { method: 'POST' });
export const deleteAccount = () => api<{ deleted: boolean }>('/api/auth/account', { method: 'DELETE' });
// ── AI Advisor ──────────────────────────────────────────────
export const aiAdvisorChat = (message: string, session_id?: string, language?: string) =>
  api<{ session_id: string; reply: string }>('/api/ai-advisor/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id, language }),
  });
export const aiAdvisorHistory = (session_id?: string) =>
  api<{ messages: Array<{ _id: string; role: 'user' | 'assistant'; content: string; timestamp: string; session_id: string }> }>(
    session_id ? `/api/ai-advisor/history?session_id=${encodeURIComponent(session_id)}` : '/api/ai-advisor/history'
  );
export const aiAdvisorClearHistory = () =>
  api<{ deleted: number }>('/api/ai-advisor/history', { method: 'DELETE' });
export const aiAdvisorInsight = () =>
  api<{ insight: string; cached: boolean }>('/api/ai-advisor/insight');

// ── Markets ──────────────────────────────────────────────
export type FxRate = { base: string; quote: string; rate: number; date: string };
export type StockQuote = {
  symbol: string; price: number; change: number; changePercent: number;
  high: number; low: number; prevClose: number;
};

export const getFxRates = () => api<{ rates: FxRate[]; cached: boolean }>('/api/markets/fx');
export const getStockQuotes = (symbols?: string) =>
  api<{ quotes: StockQuote[] }>(symbols ? `/api/markets/stocks?symbols=${encodeURIComponent(symbols)}` : '/api/markets/stocks');
export const getWatchlist = () => api<Array<{ id: string; symbol: string }>>('/api/watchlist');
export const addToWatchlist = (symbol: string) =>
  api<{ id: string; symbol: string }>('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) });
export const removeFromWatchlist = (symbol: string) =>
  api<{ deleted: boolean }>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });

// ── Smart Insights (Predictive + Leaks + Personality + Weekly) ──
export type InsightForecast = {
  runway_days: number;
  discretionary_remaining: number;
  daily_burn: number;
  projected_month_exp: number;
  projected_end_balance: number;
  risk_level: 'low' | 'medium' | 'high' | 'unknown';
  risk_reason: string;
  days_left_in_month: number;
};
export type MoneyLeak = {
  type: 'creep' | 'subscription' | 'duplicate' | 'price_increase';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  estimated_waste: number;
  category: string;
};
export type Personality = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  description: string;
};
export type WeeklyReport = {
  week_total: number;
  prior_week_total: number;
  change_pct: number;
  top_category: string | null;
  transaction_count: number;
};
export type InsightsResponse = {
  currency: string;
  forecast: InsightForecast;
  leaks: MoneyLeak[];
  total_leak_savings: number;
  personality: Personality;
  weekly_report: WeeklyReport;
};

export const getInsights = () => api<InsightsResponse>('/api/insights');

export type ScenarioInput = {
  salary: number;
  bills_adjustment?: number;
  monthly_savings_target?: number;
  big_purchase_amount?: number;
  goal_name?: string;
  goal_target_amount?: number;
};
export type ScenarioResult = {
  new_salary: number;
  new_bills: number;
  projected_monthly_expenses: number;
  monthly_savings: number;
  net_left: number;
  bills_ratio_pct: number;
  risk_level: 'low' | 'medium' | 'high';
  goal_timeline_months: number | null;
  goal_name: string;
  goal_target: number;
};

export const runScenario = (data: ScenarioInput) =>
  api<ScenarioResult>('/api/scenario', { method: 'POST', body: JSON.stringify(data) });

// ── Financial Immune System Score ──────────────────────────────────
export type ImmuneFactor = {
  score: number; max: number; label: string;
  months_covered?: number; total_liquid?: number;
  pct?: number; total_obligations?: number; net?: number;
};
export type ImmuneScore = {
  score: number;
  level: 'Resilient' | 'Stable' | 'Vulnerable' | 'At Risk';
  color: string;
  description: string;
  factors: {
    emergency_fund: ImmuneFactor;
    obligation_ratio: ImmuneFactor;
    savings_rate: ImmuneFactor;
  };
  tips: string[];
  currency: string;
};
export const getImmuneScore = () => api<ImmuneScore>('/api/immune-score');

// ── Subscription Graveyard ─────────────────────────────────────────
export type GraveSub = {
  id: string;
  name: string;
  monthly_cost: number;
  cumulative_cost: number;
  months_active: number;
  marked_unused: boolean;
  last_used_date?: string | null;
  type: 'bill' | 'recurring_expense';
  category: string;
  is_buried: boolean;
};
export type GraveyardResponse = {
  subscriptions: GraveSub[];
  total_monthly: number;
  total_annual: number;
  total_waste_monthly: number;
  total_waste_annual: number;
  currency: string;
  months_active: number;
};
export const getSubscriptionGraveyard = () =>
  api<GraveyardResponse>('/api/subscription-graveyard');
export const toggleSubscriptionUnused = (subId: string) =>
  api<{ marked_unused: boolean }>(
    `/api/subscription-graveyard/${encodeURIComponent(subId)}/toggle-unused`,
    { method: 'PATCH' },
  );

// ── Future Self Projector ──────────────────────────────────────────
export type FutureProjection = { years: number; balance: number; label: string };
export type FuturePath = {
  monthly_savings: number;
  monthly_spend: number;
  monthly_freed?: number;
  projections: FutureProjection[];
};
export type FutureSelfResponse = {
  currency: string;
  current: FuturePath;
  optimized: FuturePath;
  assumptions: {
    annual_return_pct: number;
    starting_balance: number;
    optimization_source: 'subscription_cleanup' | '10pct_discretionary_reduction';
  };
};
export const getFutureSelf = () =>
  api<FutureSelfResponse>('/api/future-self', { method: 'POST' });
