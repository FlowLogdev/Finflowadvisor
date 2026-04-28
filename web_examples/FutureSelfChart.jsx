import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiPost } from './api';

/**
 * Future Self Projector Chart
 * Calls: POST /api/future-self
 *
 * Shows:
 *   - Dual-line chart: Current path vs Optimized path
 *   - 5/10/20/30 year horizons
 *   - "Money freed up by cleaning subscriptions" callout
 *   - 7% annual return (S&P 500 historical)
 */
export default function FutureSelfChart() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiPost('/api/future-self', {}).then(setData).catch(e => setErr(e.message));
  }, []);

  if (err) return <Card><p className="text-red-600">Failed: {err}</p></Card>;
  if (!data) return <Card><p className="text-gray-500">Loading projection…</p></Card>;

  const { currency, current, optimized, assumptions } = data;

  // Build a row per horizon with both lines
  const chartData = current.projections.map((p, i) => ({
    label: p.label,
    Current: p.balance,
    Optimized: optimized.projections[i].balance,
  }));

  const fmt = (n) => `${currency}${(n / 1000).toFixed(0)}k`;
  const fmtFull = (n) => `${currency}${n.toLocaleString()}`;

  const final30 = current.projections[current.projections.length - 1].balance;
  const final30Opt = optimized.projections[optimized.projections.length - 1].balance;
  const delta = final30Opt - final30;

  return (
    <Card>
      <h2 className="text-xl font-bold mb-1 text-gray-900">Your Future Self</h2>
      <p className="text-xs text-gray-500 mb-4">
        Projected at {assumptions.annual_return_pct}% annual return · starting balance {fmtFull(assumptions.starting_balance)}
      </p>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => fmtFull(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="Current"
              stroke="#94a3b8"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Optimized"
              stroke="#2d5a3d"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Stat label="Current monthly savings" value={fmtFull(current.monthly_savings)} />
        <Stat label="Optimized monthly savings" value={fmtFull(optimized.monthly_savings)} accent="#2d5a3d" />
        <Stat label="In 30 years (current)" value={fmtFull(final30)} />
        <Stat label="In 30 years (optimized)" value={fmtFull(final30Opt)} accent="#2d5a3d" />
      </div>

      {delta > 0 && (
        <div className="mt-4 p-3 bg-emerald-50 border-l-4 border-emerald-500 rounded">
          <p className="text-sm text-emerald-900">
            By freeing up <b>{fmtFull(optimized.monthly_freed)}/mo</b> from{' '}
            {assumptions.optimization_source === 'subscription_cleanup'
              ? 'unused subscriptions'
              : 'discretionary spending'}
            , you'd have <b>{fmtFull(delta)} more</b> in 30 years.
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-bold" style={{ color: accent || '#1f2937' }}>{value}</p>
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">{children}</div>;
}
