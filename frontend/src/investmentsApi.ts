// Investment API helpers — talks to local backend /api/investments/*

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken } from './auth';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function resolveToken(): Promise<string | null> {
  const t = getToken();
  if (t) return t;
  try { return await AsyncStorage.getItem('finflow_token'); } catch { return null; }
}

async function iApi<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await resolveToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api${path}`, { headers, ...options });
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────
export type InvestmentRates = {
  br: {
    selic_annual_pct: number | null;
    cdi_annual_pct: number | null;
    poupanca_annual_pct: number | null;
    fallback?: boolean;
  };
  us: {
    fed_funds_pct: number | null;
    treasury_1y_pct: number | null;
    treasury_5y_pct: number | null;
    treasury_10y_pct: number | null;
    hysa_avg_pct: number | null;
    fallback?: boolean;
  };
  fetched_at: string;
  cached: boolean;
};

export type Institution = {
  name: string;
  product: string;
  rate_label: string;
  rate_pct_cdi?: number;
  rate_apy?: number;
  min_amount: number;
  liquidity: string;
  safety: string;
  url: string;
  emoji: string;
};

export type InstitutionsResponse = {
  country: 'BR' | 'US';
  institutions: Institution[];
  safety_note: string;
};

export type ProjectSeries = {
  annual_rate_pct: number;
  series: Array<{ month: number; balance: number }>;
  final_amount: number;
  total_invested: number;
  total_earnings: number;
};

export type ProjectResponse = {
  period_months: number;
  total_invested: number;
  br: { cdb: ProjectSeries; tesouro: ProjectSeries; poupanca: ProjectSeries };
  us: { hysa: ProjectSeries; ustreasury: ProjectSeries; savings: ProjectSeries };
};

export type AdviceResponse = {
  advice: string;
  bucket: string;
  monthly_savings: number;
  currency: string;
  benchmark_pct: number;
  fallback?: boolean;
};

// ── Endpoints ─────────────────────────────────────────────────
export const getInvestmentRates = () =>
  iApi<InvestmentRates>('/investments/rates');

export const getInstitutions = (country: 'br' | 'us') =>
  iApi<InstitutionsResponse>(`/investments/institutions?country=${country}`);

export const projectInvestment = (
  initial: number, monthly: number, period_months: number
) =>
  iApi<ProjectResponse>('/investments/project', {
    method: 'POST',
    body: JSON.stringify({ initial, monthly, period_months }),
  });

export const getInvestmentAdvice = (params: {
  country: 'br' | 'us';
  goal_name?: string;
  goal_amount?: number;
  time_horizon_months?: number;
}) =>
  iApi<AdviceResponse>('/investments/advice', {
    method: 'POST',
    body: JSON.stringify(params),
  });
