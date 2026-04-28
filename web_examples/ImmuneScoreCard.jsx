import React, { useEffect, useState } from 'react';
import { apiGet } from './api';

/**
 * Financial Immune Score Card
 * Calls: GET /api/immune-score
 *
 * Shows:
 *   - Big circular gauge (SVG arc) with score 0-100
 *   - Level badge ("Resilient", "Stable", "Vulnerable", "At Risk")
 *   - Factor breakdown bars (Emergency Fund, Obligation Ratio, Savings Rate)
 *   - Auto-generated tips
 */
export default function ImmuneScoreCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    apiGet('/api/immune-score').then(setData).catch(e => setErr(e.message));
  }, []);

  if (err) return <Card><p className="text-red-600">Failed: {err}</p></Card>;
  if (!data) return <Card><p className="text-gray-500">Loading immune score…</p></Card>;

  const { score, level, color, description, factors, tips, currency } = data;

  // SVG arc: 270° sweep, score % of 270
  const RADIUS = 80;
  const STROKE = 14;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const SWEEP = 0.75; // 270° of 360°
  const PROGRESS = (score / 100) * CIRCUMFERENCE * SWEEP;
  const TRACK = CIRCUMFERENCE * SWEEP;

  return (
    <Card>
      <h2 className="text-xl font-bold mb-4 text-gray-900">Financial Immune Score</h2>

      <div className="flex flex-col items-center gap-2 mb-6">
        <div className="relative">
          <svg width="220" height="220" style={{ transform: 'rotate(135deg)' }}>
            {/* Track */}
            <circle
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${TRACK} ${CIRCUMFERENCE}`}
            />
            {/* Progress */}
            <circle
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${PROGRESS} ${CIRCUMFERENCE}`}
              style={{ transition: 'stroke-dasharray 800ms ease' }}
            />
          </svg>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ pointerEvents: 'none' }}
          >
            <div className="text-5xl font-bold" style={{ color }}>{score}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">/ 100</div>
          </div>
        </div>

        <span
          className="px-3 py-1 rounded-full text-sm font-semibold mt-2"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {level}
        </span>
        <p className="text-sm text-gray-600 text-center max-w-xs">{description}</p>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-3 mb-4">
        <FactorBar label="Emergency Fund" data={factors.emergency_fund} subtext={`${factors.emergency_fund.months_covered} months covered`} />
        <FactorBar label="Fixed Obligations" data={factors.obligation_ratio} subtext={`${factors.obligation_ratio.pct}% of income`} />
        <FactorBar label="Savings Rate" data={factors.savings_rate} subtext={`${factors.savings_rate.pct}% saved (${currency}${factors.savings_rate.net.toLocaleString()})`} />
      </div>

      {/* Tips */}
      {tips && tips.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
          <p className="text-xs font-semibold text-amber-800 mb-1">Tips to improve:</p>
          <ul className="text-xs text-amber-900 space-y-1">
            {tips.map((t, i) => <li key={i}>• {t}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

function FactorBar({ label, data, subtext }) {
  const pct = (data.score / data.max) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{data.score} / {data.max}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 75 ? '#43a047' : pct >= 50 ? '#1a4a8a' : pct >= 30 ? '#b8740a' : '#c84b1f',
            transition: 'width 600ms ease',
          }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{subtext}</p>
    </div>
  );
}

function Card({ children }) {
  return <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">{children}</div>;
}
