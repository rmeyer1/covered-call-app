# Covered Call App — Theta Integration Implementation Plan

This plan turns the theta concepts (see `feature.md` and `snapshot-response.md`) into a minimal‑clutter, progressive UI that preserves the current look and feel while adding useful insight.

## 1) API Updates

Goal: Provide enough data to power UI components without duplicate client math.

- Query params (optional)
  - `daysAhead` (default: 35) — target expiration window for selecting the next contract.
  - `otmFactors` (default: `1.1,1.15,1.2`) — comma‑separated multipliers used to select OTM strikes.

- Response shape additions
  - For each suggestion, include optional greeks (when present in Alpaca snapshots): `theta?`, `gamma?`, `vega?`, `impliedVolatility?`.
  - Provide context fields to avoid duplicate work client‑side: `selectedExpiration` (ISO date) and `dte` (days to expiration).

- Mapping preservation
  - Ensure snapshot mapping retains `greeks` and `impliedVolatility` fields (see `snapshot-response.md`).

- Error handling
  - Maintain existing 403/404/502 paths with clear messages; keep structured logs gated by env.

## 2) Shared Types

- Extend `@/types`:
  - `export interface Suggestion` → add `theta?`, `gamma?`, `vega?`, `impliedVolatility?`, and `dte?: number`.
  - `export interface SuggestionsData` → keep `{ currentPrice: number; suggestions: Suggestion[] }`, optionally add `selectedExpiration?: string`.
  - `export type GetSuggestionsResponse = SuggestionsData`.
  - `export type ApiError = { error: string; status?: number; details?: string }`.

## 3) Helpers (Server)

- `src/lib/options.ts`
  - Update `buildSuggestions(...)` to copy through greeks (`theta`, `gamma`, `vega`) and `impliedVolatility` from the chosen call when present; compute `dte` and include in each suggestion.

- `src/lib/alpaca.ts`
  - Keep `getOptionChain` and `getUnderlyingPrice` as is; ensure snapshots retain greeks and IV.

## 4) Route Changes

- `src/app/api/suggestions/[ticker]/route.ts`
  - Parse `daysAhead` and `otmFactors` from `req.nextUrl.searchParams` with sane defaults.
  - Pass into `nextExpirationDateForChain` and `buildSuggestions`.
  - Include `selectedExpiration` in the JSON and ensure each suggestion includes `dte` and optional greeks.

## 5) UI Components (Progressive Disclosure)

- GreeksStrip: compact chips above the table (Delta, DTE, OTM%).
- ThetaBadge: small pill on each row; show `θ -0.05` when present, else heuristic label (High/Mod/Low).
- StrategyExplainerDrawer: “What is theta?” link opens a concise explainer (content from `feature.md`).
- WhatIfControls: quick‑pick Expiration (+1/+2 weeks) and OTM (+10/+15/+20%) that call the API with new params.
- YieldBreakdown (optional): tiny bar to visualize time value vs intrinsic with a tooltip referencing theta.

## 6) Page Wiring

- `StockCard`
  - Render GreeksStrip and What‑If controls above `SuggestionsTable`.
  - Persist What‑If selections per ticker in state/localStorage.

- `SuggestionsTable`
  - Add a theta badge inline (default) or a column via a “Show greeks” toggle.
  - Keep sorting; optionally support sort by `theta` when present.

## 7) Styling/Behavior

- Use existing Tailwind tokens and framer‑motion transitions; keep subtle and consistent.
- Tooltips via lucide `HelpCircle` and accessible hover/focus states.
- Respect logger toggles: no noisy console in prod.

## 8) Validation & QA

- API: verify presence/absence of greeks across several tickers; ensure `theta` is optional and safe to render when null. Confirm `daysAhead` and `otmFactors` affect outputs.
- UI: confirm dark mode, spacing, animations, tooltips/drawer accessibility, and mobile table scroll.

## 9) Rollout Plan

1. Ship API additions (backward compatible).
2. Add client types + UI components with behind‑the‑scenes toggle for theta badge/column.
3. Enable What‑If controls; debounce and memoize results.
4. Optional: add “Show full greeks” toggle to avoid default clutter.

