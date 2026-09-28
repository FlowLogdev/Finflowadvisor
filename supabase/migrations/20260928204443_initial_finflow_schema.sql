-- FinFlowAdvisors target schema. Application tables are accessed by the API
-- with a server-only service credential during the Mongo-to-Supabase cutover.
-- Do not grant browser/mobile clients direct access until Supabase Auth is wired
-- into the client and the API is changed to verify Supabase JWTs.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salary numeric(14,2) not null default 5000 check (salary >= 0),
  currency text not null default '$' check (char_length(currency) between 1 and 12),
  pct_needs numeric(5,2) not null default 50 check (pct_needs between 0 and 100),
  pct_wants numeric(5,2) not null default 30 check (pct_wants between 0 and 100),
  pct_savings numeric(5,2) not null default 20 check (pct_savings between 0 and 100),
  last_recurring_month date
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_day smallint check (due_day between 1 and 31),
  marked_unused boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null,
  amount numeric(14,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  recurring boolean not null default false,
  marked_unused boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  target numeric(14,2) not null check (target >= 0),
  saved numeric(14,2) not null default 0 check (saved >= 0),
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) <= 16000),
  created_at timestamptz not null default now()
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_date date not null,
  content text not null check (char_length(content) <= 16000),
  created_at timestamptz not null default now(),
  unique (user_id, insight_date)
);

create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,16}$'),
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text not null unique,
  access_token_ciphertext text not null,
  institution_name text,
  cursor text,
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.plaid_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text not null references public.plaid_items(plaid_item_id) on delete cascade,
  plaid_transaction_id text not null,
  name text not null,
  amount numeric(14,2) not null,
  transaction_date date,
  category text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, plaid_transaction_id)
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  ticket_number text not null unique,
  email text not null,
  subject text not null check (char_length(subject) between 1 and 240),
  message text not null check (char_length(message) between 1 and 12000),
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  replies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bills_user_id_idx on public.bills(user_id);
create index expenses_user_date_idx on public.expenses(user_id, expense_date desc);
create index savings_goals_user_id_idx on public.savings_goals(user_id);
create index ai_messages_user_session_created_idx on public.ai_messages(user_id, session_id, created_at);
create index watchlist_user_id_idx on public.watchlist(user_id);
create index plaid_items_user_id_idx on public.plaid_items(user_id);
create index plaid_transactions_user_date_idx on public.plaid_transactions(user_id, transaction_date desc);
create index support_tickets_status_updated_idx on public.support_tickets(status, updated_at desc);

-- Lock every exposed table to server-side access until the client uses
-- Supabase Auth. The service role bypasses RLS and is never exposed to Expo.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'settings', 'bills', 'expenses', 'savings_goals',
    'ai_messages', 'ai_insights', 'watchlist', 'plaid_items',
    'plaid_transactions', 'support_tickets'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
