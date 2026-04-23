#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Add AI Money Advisor feature (5th tab) powered by LLM to FinFlow app.
  User wants to eventually charge monthly subscription via RevenueCat.
  Phase 1 (this iteration): Build AI Advisor chat tab + Daily AI insight card on Dashboard.

backend:
  - task: "AI Advisor chat endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added POST /api/ai-advisor/chat endpoint. Uses emergentintegrations LlmChat with
          gpt-4.1-mini via EMERGENT_LLM_KEY. Injects user's financial snapshot (salary, bills,
          current-month expenses grouped by category) into the system prompt. Persists both user
          messages and assistant replies to ai_messages MongoDB collection (fields: user_id,
          session_id, role, content, timestamp). Returns {session_id, reply}. Requires JWT auth
          via Bearer token (same get_current_user dependency used elsewhere).
          Manually verified via curl: responds in ~3s with personalized multi-step advice.
      - working: true
        agent: "testing"
        comment: |
          All scenarios pass via /app/backend_test.py against external URL
          https://cashflow-staging-4.preview.emergentagent.com/api:
          (1) No-auth → 401 ✓
          (2) Empty message → 400 with detail "Message cannot be empty" ✓
          (3) First message "How can I save $500 this month?" returns 200 with non-empty
              session_id + 1070-char reply from gpt-4.1-mini (LiteLLM logs confirm openai call) ✓
          (4) Multi-turn follow-up with same session_id returns 200 with SAME session_id,
              574-char coherent reply ✓
          (5) Context injection: "What's my salary and budget split?" reply explicitly
              references $5000 salary and 50/30/20 split with calculated targets
              ($2500 Needs / $1500 Wants / $1000 Savings) — financial snapshot injection works ✓
          Both user message and assistant reply correctly persisted to db.ai_messages (verified
          in test 7 via /ai-advisor/history — 6 rows alternating user/assistant in timestamp
          order after 3 chat calls).

  - task: "AI Advisor daily insight endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added GET /api/ai-advisor/insight. Generates ONE short daily money tip (<50 words)
          using LLM, caches per-day per-user in ai_insights collection so repeated calls same-day
          return cached result without a new LLM call (cost optimization). On LLM failure returns
          a fallback static tip so UI never breaks.
      - working: true
        agent: "testing"
        comment: |
          Verified via backend_test.py:
          (1) No-auth → 401 ✓
          (2) First authenticated call (after clearing ai_insights cache for admin) returns
              200 with {insight: <207-char tip>, cached: false} ✓
          (3) Immediate second call returns 200 with {insight: SAME_TEXT, cached: true} —
              same-day caching working correctly, no second LLM call made ✓
          Cached document stored with user_id + date key YYYY-MM-DD as designed.

  - task: "AI Advisor history + clear endpoints"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          GET /api/ai-advisor/history returns ordered chat messages for current user
          (optional session_id query param filter).
          DELETE /api/ai-advisor/history purges all AI messages for the user.
      - working: true
        agent: "testing"
        comment: |
          All scenarios pass:
          GET /ai-advisor/history:
          (1) No-auth → 401 ✓
          (2) After 3 chat calls: returns 6 messages, roles alternating
              [user, assistant, user, assistant, user, assistant], strictly ordered by
              timestamp ascending ✓
          (3) ?session_id=<id> filter: returns only the 4 messages (2 user + 2 assistant)
              belonging to that session ✓
          DELETE /ai-advisor/history:
          (1) No-auth → 401 ✓
          (2) Authenticated: returns 200 with {deleted: 6} matching the exact message count ✓
          (3) Subsequent GET /ai-advisor/history returns {messages: []} confirming purge ✓

frontend:
  - task: "AI Advisor tab (5th tab in bottom nav)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/advisor.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New advisor.tsx screen with full chat UI: header (FinBot avatar + Your AI money coach),
          empty state with welcome bubble + 5 suggested prompt chips, message list with distinct
          user (green) and assistant (card-bg) bubbles, typing indicator "FinBot is thinking…",
          multiline auto-growing input with send button, trash icon to clear history, theme toggle.
          KeyboardAvoidingView properly handles iOS/Android. Respects existing theme system.
          Added to /app/frontend/app/(tabs)/_layout.tsx as 5th tab with sparkles-outline icon.

  - task: "AI Daily Insight card on Dashboard"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/dashboard.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added clickable AI insight card between the metric cards and the existing smart-tip card.
          Shows sparkle icon, "FinBot · Today's Tip" label, and the insight text. While loading,
          shows small ActivityIndicator. On tap, navigates to /(tabs)/advisor. Silently no-ops on
          API error (non-critical enhancement).

  - task: "Auth token race-condition fix (api.ts)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Fixed 401 race: previously api() called synchronous getToken() which reads an in-memory
          module variable that's only set after AuthProvider useEffect restores from AsyncStorage.
          On fresh page load/direct navigation to /advisor, the component mounted before auth
          hydrated, causing 401 on GET /api/ai-advisor/history and POST /chat.
          NEW: api() is still async but now does `await resolveToken()` which first checks
          in-memory _token (fast path), and if null falls back to AsyncStorage.getItem.
          This covers both SPA navigation (fast path) and cold page load / deep link (fallback).

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "AI Advisor chat endpoint"
    - "AI Advisor daily insight endpoint"
    - "AI Advisor history + clear endpoints"
    - "Auth token race-condition fix (api.ts)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 1 (AI Money Advisor) complete. Added 4 new /api/ai-advisor/* endpoints powered by
      emergentintegrations (gpt-4.1-mini via EMERGENT_LLM_KEY already in backend/.env), plus a
      5th tab and Dashboard insight card. All endpoints require JWT auth — test with admin@finflow.com / admin123.

      Please test the AI Advisor backend endpoints only (no frontend testing this iteration):
      1. POST /api/ai-advisor/chat with a message like "How can I save $500?" — confirm it returns
         {session_id, reply} with a non-empty reply and that a subsequent GET /api/ai-advisor/history
         returns both the user message and assistant reply.
      2. GET /api/ai-advisor/insight — confirm it returns {insight, cached}. Call it twice and
         verify the SECOND call has cached:true (same-day caching).
      3. DELETE /api/ai-advisor/history — confirm it purges all messages and returns {deleted: N}.
      4. Verify all four endpoints return 401 WITHOUT a Bearer token.
      5. Verify the financial context injection works: login as admin (has seeded settings
         $5000 salary), send a chat message, and confirm the reply references the user's actual
         numbers/currency.

      Credentials are in /app/memory/test_credentials.md.
      Do NOT test frontend screens this iteration — those will be verified by the user visually.

  - agent: "main"
    message: |
      Phase 2 complete — shipped 3 big features:

      1. **Markets (FX rates)**: new GET /api/markets/fx endpoint returns live currency rates
         from Frankfurter.dev (free, ECB-sourced). 8 pairs: USD→BRL, USD→EUR, USD→GBP, USD→JPY,
         USD→CAD, USD→AUD, EUR→USD, BRL→USD. 15-min cache.

      2. **Stocks (Finnhub quotes + watchlist)**: new endpoints
         - GET /api/markets/stocks?symbols=AAPL,GOOGL — batch quotes via Finnhub (FINNHUB_API_KEY in .env).
           5-min per-symbol cache.
         - GET /api/watchlist — user's symbols
         - POST /api/watchlist {symbol} — adds (verifies symbol exists via Finnhub first). 400 on unknown.
         - DELETE /api/watchlist/{symbol}
         All user-scoped, JWT-required.

      3. **AI Advisor language parameter**: POST /api/ai-advisor/chat now accepts an optional
         `language` field ("en" | "es" | "pt-BR"). System prompt gets a directive to reply in
         that language (tested Portuguese — works).

      Please test ONLY these backend changes:
      1. GET /api/markets/fx → returns {rates: [{base, quote, rate, date}, ...], cached: bool}. First call cached:false, second cached:true.
      2. GET /api/markets/stocks?symbols=AAPL,TSLA → returns {quotes: [{symbol, price, change, changePercent, high, low, prevClose}, ...]} with real non-zero values.
      3. POST /api/watchlist {"symbol":"MSFT"} → 200 with {id, symbol:"MSFT"}. Second call for same symbol returns same id (idempotent).
      4. POST /api/watchlist {"symbol":"NOTAREALSYMBOL123"} → 400 "Unknown stock symbol".
      5. GET /api/watchlist → returns user's watchlist array.
      6. DELETE /api/watchlist/MSFT → 200 {deleted:true}, subsequent GET shows it's gone.
      7. POST /api/ai-advisor/chat with {"message":"Hello","language":"pt-BR"} → reply should be in Brazilian Portuguese (contains non-English words like "você", "seu", "olá" etc.).
      8. Same with {"language":"es"} → reply in Spanish (contains "tu", "tus", "hola" etc.).
      9. All endpoints 401 without auth.

      Credentials: admin@finflow.com / admin123. Do NOT test frontend.
  - agent: "testing"
    message: |
      All 4 AI Advisor backend endpoints tested end-to-end via /app/backend_test.py against the
      external URL https://cashflow-staging-4.preview.emergentagent.com/api with admin JWT.
      17/17 test cases passed, 0 failures.

      Coverage:
        POST /api/ai-advisor/chat — no-auth 401 ✓, empty-message 400 ✓, first message returns
          non-empty reply from gpt-4.1-mini (~1070 chars) ✓, multi-turn with same session_id ✓,
          context injection verified — reply literally contains "$5000" salary and 50/30/20
          targets ($2500/$1500/$1000) ✓.
        GET /api/ai-advisor/insight — no-auth 401 ✓, first call cached:false with fresh LLM
          insight ✓, second call cached:true with identical text ✓ (same-day cache works).
        GET /api/ai-advisor/history — no-auth 401 ✓, returns timestamp-ordered messages with
          alternating user/assistant roles ✓, session_id filter works ✓.
        DELETE /api/ai-advisor/history — no-auth 401 ✓, returns {deleted: N} with correct
          count ✓, subsequent GET returns messages:[] ✓.

      Backend logs show LiteLLM calls to openai/gpt-4.1-mini completing successfully in ~1-3s.
      No issues found. All 3 backend tasks marked working:true, needs_retesting:false.


  - agent: "main"
    message: |
      Phase 3 complete — 6 smart features shipped: Predictive Forecast, Money Leaks detector,
      Scenario Simulator, Smarter AI Coach, Weekly Report, Financial Personality.
      New backend endpoints: GET /api/insights, POST /api/scenario.
      AI advisor context upgraded with risk metrics (runway, bills ratio, daily burn).
      New frontend: InsightsPanel component on Dashboard + /simulator screen + i18n strings.
      Manually verified: insights returns all fields, scenario returns goal_timeline_months
      (tested: 30k goal / 1k/mo = 30 months, low risk), AI works with new context.

  - agent: "testing"
    message: |
      Tested new LOCAL backend endpoints (migrated from sister-project proxy) end-to-end via
      /app/backend_test.py against https://cashflow-staging-4.preview.emergentagent.com/api.
      26/26 test cases passed, 0 failures.

      POST /api/export/file:
        - no-auth → 401 ✓
        - csv: returns {filename (.csv), mime: text/csv, base64_data, bills_count, expenses_count}.
          base64 decodes to non-empty bytes (133B with seeded data). First CSV line is exactly
          "Type,Name,Category,Amount,Date/DueDay,Recurring" ✓
        - xlsx: returns proper filename+mime (spreadsheetml), decoded bytes start with "PK"
          zip signature (5468B, valid xlsx) ✓
        - bad format ("pdf") → 400 ✓

      POST /api/support/ticket (public — no auth required):
        - Returns {ticket_number: "FF-XXXXXX" (9 chars, FF- prefix + 6 hex), status:"open",
          created_at: ISO} ✓
        - Empty name/email/description each → 400 ✓

      GET /api/admin/support/tickets:
        - no-auth → 401 ✓
        - regular JWT user → 403 ✓
        - admin JWT → 200 {tickets: [...]} containing just-created ticket ✓
        - ?status=open filter returns only open tickets ✓

      POST /api/admin/support/tickets/{t}/reply:
        - no-auth → 401, regular user → 403, admin → 200 {ok:true} ✓
        - After reply: ticket status is "replied" and the reply object is stored under replies[] ✓
        - empty message → 400, non-existent ticket → 404 ✓

      POST /api/admin/support/tickets/{t}/close:
        - no-auth → 401, regular user → 403, admin → 200 {ok:true} ✓
        - After close: ticket appears in ?status=closed list ✓
        - non-existent ticket → 404 ✓

      Smoke tests (no regression): POST /api/auth/login and GET /api/dashboard both 200 for admin.
      Fresh user registration via POST /api/auth/register also works (used for the 403 checks).
