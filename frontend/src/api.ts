import { getToken } from '@/src/auth';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
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
