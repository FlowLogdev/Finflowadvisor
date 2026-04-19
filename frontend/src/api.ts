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
