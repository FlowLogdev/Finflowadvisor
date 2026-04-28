import React, { useEffect, useState } from 'react';
import { apiGet, apiPatch } from './api';

/**
 * Subscription Graveyard
 * Calls:
 *   GET   /api/subscription-graveyard
 *   PATCH /api/subscription-graveyard/{id}/toggle-unused
 *
 * Shows:
 *   - Total monthly + annual cost
 *   - Total wasted (marked unused) per month/year
 *   - Sortable list (buried first, then by cost)
 *   - Toggle "Mark as Unused" to bury a sub
 */
export default function SubscriptionGraveyard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [toggling, setToggling] = useState(null);

  const refresh = () => apiGet('/api/subscription-graveyard').then(setData).catch(e => setErr(e.message));

  useEffect(() => { refresh(); }, []);

  const handleToggle = async (id) => {
    setToggling(id);
    try {
      await apiPatch(`/api/subscription-graveyard/${id}/toggle-unused`, {});
      await refresh();
    } catch (e) {
      alert(`Failed: ${e.message}`);
    } finally {
      setToggling(null);
    }
  };

  if (err) return <Card><p className="text-red-600">Failed: {err}</p></Card>;
  if (!data) return <Card><p className="text-gray-500">Loading subscriptions…</p></Card>;

  const { subscriptions, total_monthly, total_annual, total_waste_monthly, total_waste_annual, currency, months_active } = data;
  const fmt = (n) => `${currency}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <h2 className="text-xl font-bold mb-1 text-gray-900">⚰️ Subscription Graveyard</h2>
      <p className="text-xs text-gray-500 mb-4">Tracking your recurring spend over the past {months_active} months.</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Per month" value={fmt(total_monthly)} />
        <Stat label="Per year" value={fmt(total_annual)} />
        <Stat label="Wasted/mo" value={fmt(total_waste_monthly)} accent="#c84b1f" />
        <Stat label="Wasted/yr" value={fmt(total_waste_annual)} accent="#c84b1f" />
      </div>

      {subscriptions.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No recurring subscriptions yet. Add a bill in the "Subscriptions" category.</p>
      ) : (
        <ul className="space-y-2">
          {subscriptions.map(sub => (
            <li
              key={sub.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition ${
                sub.is_buried
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                    sub.is_buried ? 'bg-red-200' : 'bg-emerald-100'
                  }`}
                >
                  {sub.is_buried ? '⚰️' : '💳'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${sub.is_buried ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {sub.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmt(sub.monthly_cost)}/mo · paid {fmt(sub.cumulative_cost)} so far
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(sub.id)}
                disabled={toggling === sub.id}
                className={`ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  sub.is_buried
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                } ${toggling === sub.id ? 'opacity-50 cursor-wait' : ''}`}
              >
                {toggling === sub.id ? '…' : sub.is_buried ? 'Revive' : 'Bury'}
              </button>
            </li>
          ))}
        </ul>
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
