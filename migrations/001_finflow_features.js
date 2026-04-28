// =============================================================================
// FinFlow MongoDB Migration — New Features
// =============================================================================
// Run with: mongosh "<MONGO_URL>/<DB_NAME>" migrations/001_finflow_features.js
// Or via Mongo shell: load("migrations/001_finflow_features.js")
//
// This migration is IDEMPOTENT — safe to run multiple times.
// Adds:
//   - New collections: support_tickets, watchlist, ai_messages, ai_insights
//   - New fields on existing collections: bills.marked_unused, expenses.recurring/marked_unused, settings.language
//   - Required indexes
// =============================================================================

print("=== FinFlow migration 001: new features ===");

// -----------------------------------------------------------------------------
// 1. USERS — ensure unique email + created_at backfill
// -----------------------------------------------------------------------------
print("\n→ users: ensuring email index + created_at backfill...");
db.users.createIndex({ email: 1 }, { unique: true, name: "uniq_email" });

// Backfill created_at for legacy users (used by Subscription Graveyard)
const usersBackfill = db.users.updateMany(
  { created_at: { $exists: false } },
  { $set: { created_at: new Date() } }
);
print(`  - users.created_at backfilled on ${usersBackfill.modifiedCount} docs`);

// Backfill role
db.users.updateMany(
  { role: { $exists: false } },
  { $set: { role: "user" } }
);

// -----------------------------------------------------------------------------
// 2. SETTINGS — add language field (default "en")
// -----------------------------------------------------------------------------
print("\n→ settings: adding language field...");
const settingsLang = db.settings.updateMany(
  { language: { $exists: false } },
  { $set: { language: "en" } }
);
print(`  - settings.language backfilled on ${settingsLang.modifiedCount} docs`);
db.settings.createIndex({ user_id: 1 }, { name: "idx_user" });

// -----------------------------------------------------------------------------
// 3. BILLS — add marked_unused (Subscription Graveyard) + indexes
// -----------------------------------------------------------------------------
print("\n→ bills: adding marked_unused + indexes...");
const billsUnused = db.bills.updateMany(
  { marked_unused: { $exists: false } },
  { $set: { marked_unused: false } }
);
print(`  - bills.marked_unused backfilled on ${billsUnused.modifiedCount} docs`);
db.bills.createIndex({ user_id: 1 }, { name: "idx_user" });
db.bills.createIndex({ user_id: 1, category: 1 }, { name: "idx_user_category" });
db.bills.createIndex({ id: 1 }, { name: "idx_id" });

// -----------------------------------------------------------------------------
// 4. EXPENSES — recurring + marked_unused + indexes
// -----------------------------------------------------------------------------
print("\n→ expenses: adding recurring/marked_unused + indexes...");
// Normalize legacy `isRecurring` → `recurring` (keep both for backward compat)
db.expenses.find({ isRecurring: { $exists: true }, recurring: { $exists: false } }).forEach(doc => {
  db.expenses.updateOne({ _id: doc._id }, { $set: { recurring: !!doc.isRecurring } });
});

const expRec = db.expenses.updateMany(
  { recurring: { $exists: false } },
  { $set: { recurring: false } }
);
print(`  - expenses.recurring backfilled on ${expRec.modifiedCount} docs`);

const expUnused = db.expenses.updateMany(
  { marked_unused: { $exists: false } },
  { $set: { marked_unused: false } }
);
print(`  - expenses.marked_unused backfilled on ${expUnused.modifiedCount} docs`);

db.expenses.createIndex({ user_id: 1 }, { name: "idx_user" });
db.expenses.createIndex({ user_id: 1, date: -1 }, { name: "idx_user_date" });
db.expenses.createIndex({ user_id: 1, recurring: 1 }, { name: "idx_user_recurring" });
db.expenses.createIndex({ id: 1 }, { name: "idx_id" });

// -----------------------------------------------------------------------------
// 5. SAVINGS_GOALS — index
// -----------------------------------------------------------------------------
print("\n→ savings_goals: indexes...");
db.savings_goals.createIndex({ user_id: 1 }, { name: "idx_user" });

// -----------------------------------------------------------------------------
// 6. WATCHLIST — new collection (Stocks feature)
// -----------------------------------------------------------------------------
print("\n→ watchlist: creating collection + indexes...");
db.createCollection("watchlist", { capped: false });
db.watchlist.createIndex(
  { user_id: 1, symbol: 1 },
  { unique: true, name: "uniq_user_symbol" }
);
db.watchlist.createIndex({ user_id: 1, created_at: 1 }, { name: "idx_user_created" });

// -----------------------------------------------------------------------------
// 7. AI_MESSAGES — chat history with FinBot
// -----------------------------------------------------------------------------
print("\n→ ai_messages: creating collection + indexes...");
db.createCollection("ai_messages", { capped: false });
db.ai_messages.createIndex({ user_id: 1, ts: 1 }, { name: "idx_user_ts" });
db.ai_messages.createIndex({ user_id: 1, session_id: 1 }, { name: "idx_user_session" });

// -----------------------------------------------------------------------------
// 8. AI_INSIGHTS — daily generated tips
// -----------------------------------------------------------------------------
print("\n→ ai_insights: creating collection + indexes...");
db.createCollection("ai_insights", { capped: false });
db.ai_insights.createIndex({ user_id: 1, generated_at: -1 }, { name: "idx_user_generated" });

// -----------------------------------------------------------------------------
// 9. SUPPORT_TICKETS — local ticket system
// -----------------------------------------------------------------------------
print("\n→ support_tickets: creating collection + indexes...");
db.createCollection("support_tickets", { capped: false });
db.support_tickets.createIndex(
  { ticket_number: 1 },
  { unique: true, name: "uniq_ticket_number" }
);
db.support_tickets.createIndex({ email: 1, created_at: -1 }, { name: "idx_email_created" });
db.support_tickets.createIndex({ status: 1, created_at: -1 }, { name: "idx_status_created" });

// -----------------------------------------------------------------------------
// 10. Final summary
// -----------------------------------------------------------------------------
print("\n=== Collections in DB ===");
db.getCollectionNames().forEach(name => {
  const count = db.getCollection(name).estimatedDocumentCount();
  print(`  ${name}: ${count} docs`);
});

print("\n✅ Migration 001 complete.");
