# FinFlow Web Component Examples

These are React (Next.js / CRA / Vite — framework-agnostic) reference implementations for the three flagship features. They use:

- **TailwindCSS** for styling (swap for your own classes if needed)
- **Recharts** for charts (`yarn add recharts`)
- **Native fetch** — no API client library required (replace `fetch` with axios if preferred)

## Files

- `ImmuneScoreCard.jsx` — Circular gauge + factor breakdown
- `FutureSelfChart.jsx` — Dual-line projection chart (Current vs Optimized)
- `SubscriptionGraveyard.jsx` — Sortable list with mark-as-unused toggle
- `api.js` — Tiny fetch wrapper with auth token from localStorage

## Install

```bash
yarn add recharts
# or
npm i recharts
```

## Usage

```jsx
import ImmuneScoreCard from './ImmuneScoreCard';
import FutureSelfChart from './FutureSelfChart';
import SubscriptionGraveyard from './SubscriptionGraveyard';

export default function Dashboard() {
  return (
    <div className="grid gap-6 p-6 md:grid-cols-2">
      <ImmuneScoreCard />
      <FutureSelfChart />
      <div className="md:col-span-2">
        <SubscriptionGraveyard />
      </div>
    </div>
  );
}
```

## Auth

The `api.js` helper expects a JWT in `localStorage` under the key `finflow_token`. After login:
```js
localStorage.setItem('finflow_token', response.data.access_token);
```
