# FinFlowAdvisors recovery and cutover

This repository is an Expo iOS client and a FastAPI API. It is **not** a Next.js
website. Existing App Store builds call the API origin configured at build time;
keep the `/api/*` contract and assign the production API custom domain before
retiring the old host.

## What is ready in this repository

- Vercel discovers `backend.server:app` from `pyproject.toml`.
- Root `requirements.txt` contains runtime dependencies only, keeping test and
  mobile assets out of the Python function bundle.
- `supabase/migrations/` contains the target PostgreSQL data model with RLS.
- `.env.example` documents every required secret without storing one.

## Required account-side actions (do not commit these values)

1. Create a Supabase project and apply the migration. Keep `anon` and
   `authenticated` blocked from the application tables; the API uses a
   server-only service credential during the transition.
2. Export the old Mongo collections, validate user counts and balances, and
   transform their ObjectId `user_id` values before importing. There is no
   Mongo connection string in this checkout, so this cannot be inferred.
3. Create/link the Vercel project from this repository. Add the server secrets
   to both Preview and Production; add mobile `EXPO_PUBLIC_*` values only to
   the Expo/EAS build environment.
4. Deploy a preview. Verify `GET /api/health`, a fresh registration/login,
   user isolation, Plaid sandbox, RevenueCat entitlement, and support tickets.
5. Point `finflowadvisors.com` at Vercel only after those checks pass. Existing
   iOS builds cannot be redirected to a different origin without preserving the
   current domain or shipping a new App Store build.

## Important migration boundary

The current running FastAPI code uses MongoDB and custom HS256 JWTs. The SQL
schema is deliberately prepared separately: replacing its database adapter and
auth verifier before a tested export/import would destroy continuity for current
users. Do not set a Supabase service key in the Expo client.
