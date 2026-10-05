-- Compatibility columns for the existing FastAPI /api contract.
-- This is additive: it keeps the TestFlight client and Plaid sync semantics
-- intact while the database moves from MongoDB to Supabase.

alter table public.bills
  add column if not exists plaid_recurring_id text;

create unique index if not exists bills_user_plaid_recurring_id_key
  on public.bills (user_id, plaid_recurring_id)
  where plaid_recurring_id is not null;

alter table public.expenses
  add column if not exists source text;

alter table public.plaid_transactions
  add column if not exists target_collection text,
  add column if not exists target_id uuid,
  add column if not exists imported_at timestamptz;

alter table public.support_tickets
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists description text;

-- The legacy endpoint stores the user-facing message in `description`.
update public.support_tickets
set description = message
where description is null;

alter table public.support_tickets
  alter column description set not null;
