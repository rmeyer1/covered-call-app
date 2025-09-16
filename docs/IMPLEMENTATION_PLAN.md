# Plaid Integration Implementation Plan

## Goals & Scope
- Connect Plaid Investments + Identity products to import brokerage holdings tied to authenticated users.
- Normalize holdings into the existing `{ ticker, shares }` shape so covered-call, cash-secured put, and long-position dashboards can reuse current suggestion flows.
- Persist Plaid access tokens and derived holdings securely on the server while keeping all sensitive data off the client.
- Provide a client experience to link institutions, refresh data, and reconcile holdings with options strategy builders.
- Build a dedicated portfolio page that displays imported holdings, open option positions, and key portfolio metrics (avg cost, allocation %, cash).

## Architecture Overview
1. **Auth & User Context** – Introduce application-level authentication to associate Plaid items with users. Server routes must enforce session presence.
2. **Plaid Service Layer** – Add `src/lib/plaid.ts` that wraps the Plaid Node SDK (Investments + Identity). Expose helpers for link token creation, public-token exchange, holdings refresh, identity lookups, and webhook validation. Reuse `logAxiosError` patterns.
3. **Persistence** – Store Plaid `access_token`, `item_id`, institution metadata, normalized holdings snapshot, and sync timestamps in a database layer. Cache holdings per user to minimize Plaid calls.
4. **API Routes** – Add server endpoints under `src/app/api/plaid/` for link-token creation, public-token exchange, holdings retrieval, manual refresh, and webhook handling. Guard with auth middleware.
5. **Client Integration** – Use Plaid Link (`react-plaid-link`) on the covered calls page (and other dashboards) to connect accounts, surface holdings, and trigger refreshes. Replace or supplement manual ticker entry.
6. **Strategy Orchestration** – After holdings sync, filter positions by share count (>=100) and optionable symbols, then hydrate existing Alpaca suggestion calls automatically.
7. **Portfolio Experience** – Expose holdings, option contracts, cash, and derived KPIs in a portfolio dashboard that powers downstream strategy screens.
8. **Observability & Compliance** – Log non-sensitive events, monitor error rates, and document support procedures for Plaid item maintenance and user offboarding.

## Workstream Breakdown
### Phase 0 – Preparation
- Acquire Plaid sandbox/client/test keys for Investments + Identity.
- Decide on auth + storage stack (see options below).
- Update `.env.local.example` with `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`, plus webhook secret.
- Add Plaid SDK to dependencies (`plaid`).
- Draft architectural diagrams/sequence flows (link user → Plaid Link → token exchange → holdings sync → Alpaca suggestions).

### Phase 1 – Auth & Persistence Foundation
- Implement chosen auth provider (NextAuth/Auth.js or alternative) with session support in App Router.
- Scaffold persistence layer: configure ORM/datasource migrations (e.g., Prisma models for `User`, `PlaidItem`, `Holding`).
- Establish secure secret management (do **not** expose Plaid credentials to the client; share only link token and item info that is safe).

### Phase 2 – Plaid Service Layer & API Routes
- Create `src/lib/plaid.ts`:
  - `createLinkToken(userId)` – uses Investments + Identity products and sets webhook.
  - `exchangePublicToken(publicToken)` – returns `access_token`, `item_id`.
  - `fetchHoldings(accessToken)` – pulls `investments/holdings/get` + `accounts/balance/get` for cash balances.
  - `fetchIdentity(accessToken)` – optional; can enrich profiles or confirm user identity.
  - `removeItem(accessToken)` – support unlink.
- Add route handlers:
  - `POST /api/plaid/link-token` → calls `createLinkToken`.
  - `POST /api/plaid/exchange` → stores tokens, schedules initial holdings sync.
  - `GET /api/plaid/holdings` → returns cached normalized holdings.
  - `POST /api/plaid/refresh` → triggers sync.
  - `POST /api/plaid/webhook` → handles `HOLDINGS_UPDATE`, `ERROR`, `ITEM_REMOVED` events.
- Ensure handlers validate session and respond with consistent error objects (reuse `ApiError`).

### Phase 3 – Portfolio Page & Analytics
- Create `src/app/portfolio/page.tsx` (or equivalent) as the central dashboard for Plaid-derived data.
- Server fetch (RSC or route) combines holdings snapshot with:
  - Average cost, quantity, and current market value per position.
  - Allocation % by security, asset class, and institution.
  - Aggregated cash balances and buying power.
  - Linked option contracts (filter Alpaca chain for current holdings; show covered/uncovered status).
- Provide interactive tables/cards: sortable holdings table, allocation chart, open option positions list, and high-level KPIs (total equity, total cost basis, unrealized P/L).
- Enable deep links from each holding to relevant strategy flows (e.g., Covered Call suggestions preloaded).
- Respect sharing rules: only display data for the authenticated user; support loading skeletons and error states when Plaid sync is pending.

### Phase 3b – Holdings Normalization & Strategy Integration
- Implement normalization utilities to convert Plaid holdings to app stocks:
  - Map Plaid `security.ticker_symbol` (fallback to `cusip` lookup if missing).
  - Round share quantities to 2 decimals; flag fractional positions < 100.
  - Filter out non-equity assets or assets lacking public tickers; mark them as “unsupported”.
- Persist normalized holdings alongside metadata (cost basis, market value) for UI use.
- Update state management in covered-call and other pages:
  - Replace `localStorage` as the primary source; still allow manual entries as overrides.
  - On load, fetch holdings from `/api/plaid/holdings` and populate `stocks` state.
  - Gate Alpaca suggestion fetches by `shares >= 100` and log notifications for others.
  - Provide UI to refresh holdings and unlink items.

### Phase 3c – Screenshot Portfolio Import
- Build an upload panel on the portfolio page for users to drop in brokerage screenshots (desktop drag-and-drop plus mobile capture flow).
- Accept `.png`, `.jpg/.jpeg`, and `.heic` files up to ~5 MB each; upload via signed Supabase Storage URLs and persist metadata (`id`, `userId`, `filename`, `size`, `checksum`, `status`).
- Create a `PortfolioUpload` table and `/api/portfolio/uploads` route that issues signed URLs, records uploads, and enqueues a background processing job.
- Introduce a worker (Supabase Edge Function or server action on a queue) that:
  - Downloads the image, runs OCR (evaluate Google Vision vs AWS Textract vs Tesseract + helpers) to extract text with bounding boxes.
  - Detects tabular regions, standardizes headers (`Symbol`, `Ticker`, `Qty`, `Shares`, `Cost`, `Value`), and converts numeric strings (handle commas, currency, parentheses).
  - Normalizes tickers (uppercase, strip exchange suffixes), validates via Alpaca symbol metadata, and estimates confidence scores per row/field.
  - Stores parsed rows in `PortfolioHoldingDraft` linked to the upload, with JSON payload (`rawText`, `structured`, `confidence`, `issues`).
- Build a review UI on the portfolio dashboard that lists detected holdings, highlights low-confidence fields, and lets users edit/approve/delete rows before committing.
- When confirmed, merge approved holdings into the main `Holding` table with provenance (`source: 'screenshot'`), deduping against Plaid/manual records and logging actions in an `ActivityLog`.
- Add failure handling: notify user if OCR fails or layout unsupported, expose retry options, and auto-clean old uploads/drafts after retention window.

### Screenshot Import Milestones
1. **Research & Prototype (Week 1)** – Evaluate OCR providers, collect sample brokerage screenshots, and document column/header variants. Build a spike script to parse 2–3 sample layouts.
2. **Upload Pipeline (Week 2)** – Implement signed uploads, storage buckets, metadata persistence, and background job scaffolding (queue table or Supabase Task).
3. **OCR & Parsing (Week 3)** – Integrate chosen OCR service, implement table extraction heuristics + confidence scoring, and persist drafts.
4. **Review UX & Merge (Week 4)** – Create dashboard review modal, inline editing, dedupe + merge logic, activity logging, and user notifications.
5. **Hardening & Compliance (Week 5)** – Add rate limiting, retention cleanup, PII redaction, audit logging, extensive QA across devices, and documentation for attribution/cost management.

### Additional Considerations for Screenshot Imports

#### OCR Provider Decision
- **Chosen:** Google Cloud Vision API for initial implementation.
  - Rationale: strong accuracy on UI screenshots, straightforward REST/Node clients, and predictable pricing with a generous free tier.
  - Action Items:
    1. Provision a GCP project, enable Vision API, and create service account credentials (store in Supabase secrets/Vercel env vars).
    2. Implement `src/lib/vision.ts` to call Vision API (batch annotate or inline base64), encapsulate retries, and normalize responses.
    3. Transform Vision `fullTextAnnotation` blocks/paragraphs into table segments for the parser (use bounding boxes to cluster rows/columns).
    4. Set up GCP budget alerts + logging for cost monitoring.
- **Alternatives (Future):** keep AWS Textract, Azure Form Recognizer, and Tesseract in mind if higher accuracy or on-prem control is required.

- **Privacy & Security:** ensure uploads are private (signed URLs, limited retention), detect/redact account numbers, and encrypt data at rest.
- **Extensibility:** design the draft schema to support future ingestion sources (CSV, brokerage email parsing) via a shared pipeline.
- **Fallbacks:** allow manual entry if OCR confidence is low; surface suggestions for manual corrections.
- **Cost Management:** monitor OCR API usage, batch requests, and provide guidance if daily limits are reached.

### Phase 4 – UX Polish & Compliance
- Add Plaid Link button, sync status indicators, and error messaging consistent with design system.
- Provide identity details (institution name, account mask) for user confirmation.
- Write documentation in `docs/` detailing onboarding, sandbox usage, and troubleshooting.
- Ensure accessibility and responsiveness for new components.
- Finalize logging/monitoring strategy, anonymizing user data where possible.

### Phase 5 – Testing & Launch
- Unit tests for Plaid client wrappers using Plaid sandbox mocks or Jest spies.
- Integration tests for API routes (Next.js route handlers) with mocked Plaid SDK and database.
- Playwright scenarios: linking account (simulate success via sandbox), viewing imported holdings, triggering suggestion fetches.
- Security review: confirm tokens never reach client logs, enforce HTTPS for production webhook, rotate secrets policy.
- Pilot rollout with sandbox accounts before moving to production credentials.

## Auth & Storage Options

### Selected Stack – Supabase Auth + Postgres
- Adopt Supabase for both authentication and Postgres storage to keep operations lightweight.
- Enable row-level security on all Plaid-related tables; use service-role key only in server code.
- Leverage Supabase functions/triggers for webhook processing if needed (e.g., queuing Plaid sync jobs).
- Document schema ownership (Supabase `public` schema) and migration workflow via Supabase CLI/SQL migrations.

#### Exit Plan (if migrating off Supabase)
1. Use Supabase's SQL export or `pg_dump` to extract schema + data.
2. Recreate auth layer (e.g., Auth.js or custom) and map Supabase user IDs to new user identifiers (maintain `auth.uid()` mapping).
3. Migrate RLS policies to the new platform (Prisma/Postgres RLS or another mechanism).
4. Rotate Plaid access token encryption keys if moving environment; ensure tokens remain encrypted during transfer.
5. Update application config to point to new auth/database services; run smoke tests for Plaid link/exchange/holdings flows.

### Option A – NextAuth (Auth.js) + Prisma + Postgres (Supabase/Neon/RDS)
- **What you get:** Battle-tested session handling, OAuth/email/password providers, middleware that works with App Router, and Prisma migrations. Postgres stores users, sessions, Plaid items, holdings.
- **Pros:**
  - Fits seamlessly in Next.js 15 App Router with `auth()` helpers.
  - Prisma simplifies schema evolution and type-safe queries.
  - Postgres handles relational data (users ↔ Plaid items ↔ holdings) and complex queries (e.g., aggregated positions).
  - Self-hosted or managed providers (Supabase, Neon) offer row-level security, webhooks, backups.
- **Cons:**
  - Requires managing database infrastructure.
  - Need to secure Prisma API route usage (connection pooling for serverless).
  - Session cookies/JWT must be tuned for SSR/ISR contexts.
- **Best for:** full control, multi-user roadmap, future analytics or reporting features.

### Option B – Supabase Auth + Supabase Postgres *(selected)*
- **What you get:** Hosted auth (email/OAuth) and Postgres with row-level policies managed via Supabase, plus real-time and storage features.
- **Pros:**
  - Single provider for auth + data, less code to manage sessions (use Supabase client on server with service key).
  - Row-level security policies restrict access by `auth.uid()` automatically.
  - Built-in migrations via SQL or Prisma-compatible.
  - Good developer tooling (dashboard, SQL editor) and free tier for sandbox.
- **Cons:**
  - Requires Supabase JS client on server; need to guard service-role key carefully.
  - Less flexibility if you prefer custom auth flows.
  - Vendor lock-in if later moving off Supabase.
- **Best for:** quick time-to-value, minimal ops overhead, team comfortable with Supabase ecosystem.

### Option C – Clerk/Firebase Auth + Dedicated Database (e.g., Planetscale MySQL)
- **What you get:** Managed auth provider with pre-built UI widgets; separate managed DB.
- **Pros:**
  - Offloads auth UI/flows entirely.
  - Planetscale (or similar) provides scalable serverless MySQL with branching.
  - Works with Prisma (Planetscale) or drizzle-orm.
- **Cons:**
  - Two vendors to integrate (auth + DB), more moving parts.
  - Must bridge Clerk/Firebase session data with your DB manually.
  - Costs can rise with scale; fewer built-in RLS features vs Postgres.
- **Best for:** teams prioritizing polished auth UX quickly and already invested in MySQL.

### Decision Considerations
- **User Volume & Multi-Tenancy:** If expecting multiple users soon, prefer relational DB with RLS (Option A or B).
- **Operational Preferences:** Desire managed service? Supabase (Option B). Comfortable running DB or using provider? Option A.
- **Customization:** Need custom auth flows, complex roles? Option A offers the most flexibility.
- **Time-to-Launch:** Option B is fastest to wire up; Option A requires more setup but scales well.

## Data Model Sketch (Prisma-style Example)
```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  plaidItems   PlaidItem[]
  createdAt    DateTime @default(now())
}

model PlaidItem {
  id            String   @id @default(cuid())
  user          User     @relation(fields: [userId], references: [id])
  userId        String
  itemId        String   @unique
  institutionId String
  institution   String
  accessToken   String   // encrypted at rest
  cursor        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  holdings      Holding[]
}

model Holding {
  id            String   @id @default(cuid())
  plaidItem     PlaidItem @relation(fields: [plaidItemId], references: [id])
  plaidItemId   String
  ticker        String
  cusip         String?
  name          String
  quantity      Decimal
  costBasis     Decimal?
  marketValue   Decimal
  lastSyncedAt  DateTime @default(now())
}
```

> Encrypt `accessToken` before storage (e.g., using KMS or libsodium) and keep encryption keys outside source control.

## Security & Compliance Checklist
- Use Plaid recommended TLS (https) endpoints; configure webhook secret validation.
- Store Plaid secrets and access tokens encrypted; never log full tokens.
- Implement user consent flows for connecting/unlinking accounts, including deleting stored data when items are removed.
- Handle Plaid webhook retries idempotently to avoid duplicate syncs.
- Monitor API rate limits; add backoff/retry strategies in `plaid.ts` helpers.
- Update privacy policy/user agreements to cover brokerage data access.

## Testing & Validation Strategy
- Unit tests for Plaid helpers with mocked SDK responses (sandbox fixtures for holdings, identity, errors).
- Integration tests for API routes using supertest or Next.js route invocation with mocked auth context.
- E2E Playwright flow: link sandbox item → view imported holdings → auto-trigger Alpaca suggestions.
- Manual QA using Plaid Sandbox (e.g., `item_id` `ins_109508` brokerage) to confirm holdings mapping.
- Load testing for holdings sync if large portfolios expected.

## Rollout Plan
1. Complete sandbox integration end-to-end (Phase 1-3) behind feature flag.
2. Invite limited internal testers; capture feedback on holdings mapping and suggestion relevance.
3. Add production Plaid credentials, rotate env vars, and validate webhook path is publicly reachable.
4. Launch to broader audience with monitoring (metrics, alerts) and support SOPs.
5. Iterate on advanced features (cost basis analysis, option eligibility warnings, strategy recommendations).

## Open Questions / Decisions Needed
- Which auth + storage option do we adopt? (See decision considerations.)
- Do we keep manual ticker entry as a fallback alongside Plaid-imported holdings?
- Should holdings cache include pricing info or rely solely on Alpaca for live quotes?
- How often should background holdings refresh occur (webhook-driven vs scheduled)?
- Are there compliance requirements (e.g., FINRA/SEC disclosures) before exposing brokerage data to end users?
