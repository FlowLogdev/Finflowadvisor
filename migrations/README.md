# FinFlow Database Migrations

## Running

```bash
# Local Mongo
mongosh "mongodb://localhost:27017/finflow" migrations/001_finflow_features.js

# MongoDB Atlas
mongosh "mongodb+srv://USER:PASS@cluster.mongodb.net/finflow" migrations/001_finflow_features.js
```

Or from inside the Mongo shell:
```js
load("migrations/001_finflow_features.js")
```

## What 001 Does

- **Indexes** for all user-scoped queries (user_id, user_id+date, etc.)
- **Backfills** `marked_unused`, `recurring`, `language`, `created_at`, `role` on legacy docs
- **Creates** new collections: `watchlist`, `ai_messages`, `ai_insights`, `support_tickets`
- **Unique constraints** on `users.email`, `watchlist(user_id, symbol)`, `support_tickets.ticket_number`

The script is **idempotent** — safe to run multiple times.

## Rollback

There is no destructive rollback (data is only added, never removed). If you want to drop the new collections:
```js
db.watchlist.drop();
db.ai_messages.drop();
db.ai_insights.drop();
db.support_tickets.drop();
```

To remove backfilled fields:
```js
db.bills.updateMany({}, { $unset: { marked_unused: "" } });
db.expenses.updateMany({}, { $unset: { marked_unused: "", recurring: "" } });
db.settings.updateMany({}, { $unset: { language: "" } });
```
