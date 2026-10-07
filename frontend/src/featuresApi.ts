// Wrapper for the "features" backend (finflowadvisors.com).
// Shares JWT issued by cashflow-staging-4 — no re-auth needed.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from './auth';

const FEATURES_BASE = process.env.EXPO_PUBLIC_FEATURES_BACKEND || 'https://finflowadvisors.com';

async function resolveToken(): Promise<string | null> {
  const t = getToken();
  if (t) return t;
  try { return await AsyncStorage.getItem('finflow_token'); } catch { return null; }
}

async function fApi<T = any>(path: string, options?: RequestInit, authed = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authed) {
    const token = await resolveToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${FEATURES_BASE}${path}`, { headers, ...options });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json();
}

// ── Support Tickets ──────────────────────────────────────────────
export type TicketInput = { name: string; phone: string; email: string; description: string };
export type TicketResponse = { ticket_number: string; status: string; created_at?: string };

export const submitTicket = (data: TicketInput) =>
  fApi<TicketResponse>('/api/support/ticket', { method: 'POST', body: JSON.stringify(data) }, false);

// Admin-only support endpoints
export type AdminTicket = {
  id: string;
  ticket_number: string;
  name: string;
  phone: string;
  email: string;
  description: string;
  status: 'open' | 'replied' | 'closed';
  created_at: string;
  replies?: Array<{ by: string; message: string; at: string }>;
};
export const adminListTickets = (status?: string) =>
  fApi<{ tickets: AdminTicket[] }>(
    status ? `/api/admin/support/tickets?status=${status}` : '/api/admin/support/tickets'
  );
export const adminReplyTicket = (ticket_number: string, message: string) =>
  fApi<{ ok: boolean }>(`/api/admin/support/tickets/${ticket_number}/reply`, {
    method: 'POST', body: JSON.stringify({ message }),
  });
export const adminCloseTicket = (ticket_number: string) =>
  fApi<{ ok: boolean }>(`/api/admin/support/tickets/${ticket_number}/close`, { method: 'POST' });

// ── Billing (Stripe) ─────────────────────────────────────────────
export type BillingPackage = { id: string; amount: number; currency: string; label: string; days: number };
export type CheckoutResult = { url: string; session_id: string };
export type BillingStatus = { status: string; paid?: boolean; session_id?: string };
export type BillingMe = { premium: boolean; premium_until?: string; plan?: string };

export const getPackages = () => fApi<{ packages: BillingPackage[] }>('/api/billing/packages', undefined, false);
export const startCheckout = (package_id: string, origin_url: string) =>
  fApi<CheckoutResult>('/api/billing/checkout', {
    method: 'POST', body: JSON.stringify({ package_id, origin_url }),
  });
export const pollBillingStatus = (session_id: string) =>
  fApi<BillingStatus>(`/api/billing/status/${session_id}`);
export const getBillingMe = () => fApi<BillingMe>('/api/billing/me');
export const cancelSubscription = () =>
  fApi<{ ok: boolean; canceled: boolean }>('/api/billing/cancel', { method: 'POST' });

// ── Data Export ──────────────────────────────────────────────────
export const emailExport = (format: 'csv' | 'xlsx' | 'pdf') =>
  fApi<{ ok: boolean; message?: string }>('/api/export/email', {
    method: 'POST', body: JSON.stringify({ format }),
  });
export const setExportSchedule = (
  enabled: boolean, format: 'csv' | 'xlsx', refresh_token?: string
) =>
  fApi<{ ok: boolean }>('/api/export/schedule', {
    method: 'POST', body: JSON.stringify({ enabled, format, refresh_token }),
  });
