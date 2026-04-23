// Local features API — uses THIS app's backend.
// Replaces the previous sister-project proxy to make export + tickets reliable.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from './auth';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function resolveToken(): Promise<string | null> {
  const t = getToken();
  if (t) return t;
  try { return await AsyncStorage.getItem('finflow_token'); } catch { return null; }
}

async function lApi<T = any>(path: string, options?: RequestInit, authed = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authed) {
    const token = await resolveToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}/api${path}`, { headers, ...options });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json();
}

// ── Data Export ──────────────────────────────────────────────────
export type ExportFile = {
  filename: string;
  mime: string;
  base64_data: string;
  bills_count: number;
  expenses_count: number;
};

export const generateExport = (format: 'csv' | 'xlsx') =>
  lApi<ExportFile>('/export/file', { method: 'POST', body: JSON.stringify({ format }) });

// ── Support Tickets ──────────────────────────────────────────────
export type TicketInput = { name: string; phone?: string; email: string; description: string };
export type TicketResponse = { ticket_number: string; status: string; created_at?: string };

export const submitTicket = (data: TicketInput) =>
  lApi<TicketResponse>('/support/ticket', { method: 'POST', body: JSON.stringify(data) }, false);

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
  lApi<{ tickets: AdminTicket[] }>(
    status ? `/admin/support/tickets?status=${status}` : '/admin/support/tickets'
  );

export const adminReplyTicket = (ticket_number: string, message: string) =>
  lApi<{ ok: boolean }>(`/admin/support/tickets/${ticket_number}/reply`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

export const adminCloseTicket = (ticket_number: string) =>
  lApi<{ ok: boolean }>(`/admin/support/tickets/${ticket_number}/close`, { method: 'POST' });
