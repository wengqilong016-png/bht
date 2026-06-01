# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
- React 19 + TypeScript + Tailwind 4 + Supabase + Vite
- Offline-first PWA for slot machine revenue management in Tanzania
- 3 drivers + 1 admin. Drivers collect machine scores, admin manages fleet.

## Commands
```bash
npm run dev                                                  # dev server (http://localhost:3000)
npx jest --no-coverage --passWithNoTests                     # run all tests
npx jest --no-coverage --passWithNoTests __tests__/foo.ts    # run single test file
npx tsc --noEmit                                             # type check
npm run lint                                                 # lint
npm run build                                                # production build
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN supabase/.env|cut -d= -f2) npx supabase db push  # push migrations
```

## Architecture
```
App.tsx               — auth gate, wraps AuthProvider / DataProvider / MutationProvider
contexts/             — AuthContext (user/role/lang), DataContext (locations/drivers/txs), MutationContext
hooks/                — useSupabaseData (queries + isOnline), useSupabaseMutations (all mutations),
                        useOfflineSyncLoop (flush on reconnect), useAuthBootstrap (auth state machine)
services/             — financeCalculator, collectionSubmissionOrchestrator, driverManagementService
repositories/         — Supabase data access layer
offlineQueue.ts       — IndexedDB queue + sync loop (largest file, core of offline-first)
driver/               — Driver mobile app (QuickCollect, CollectionFlow, GPS)
admin/                — Admin shell and pages
shared/               — AppRouterShell: role==='admin' → admin shell, else → driver shell;
                        mustChangePassword → ForcePasswordChange before main shell
components/           — Shared UI (DriverManagement, SitesTab, Dashboard, Login)
supabase/             — Migrations, Edge Functions, schema
i18n/                 — zh.ts (admin), sw.ts (driver)
```

## Key Rules (from AGENTS.md)
- Read max 3 files initially, expand only with justification
- No scanning entire repo without reason
- Fix root cause, not symptoms. No comment-out "fixes"
- After changes: run full test suite → commit → push

## Critical Files
- `offlineQueue.ts` — offline queue, IDB, flush, retry, dead-letter (largest file)
- `hooks/useSupabaseMutations.ts` — all React Query mutations
- `hooks/useSupabaseData.ts` — data queries + isOnline health check
- `services/financeCalculator.ts` — local + server finance calculation
- `services/collectionSubmissionOrchestrator.ts` — submit pipeline
- `services/driverManagementService.ts` — Edge Function wrappers
- `components/driver-management/DriverManagementPage.tsx` — admin driver CRUD
- `driver/components/QuickCollect.tsx` — fast collection entry

## Deep Trace Docs
Loaded from `docs/traces/` directory:
- `docs/traces/offline-queue-sync-trace.md` — IDB schema, enqueue/flush/markSynced
- `docs/traces/collection-submit-trace.md` — QuickCollect→submit_collection_v2 SQL
- `docs/traces/admin-crud-trace.md` — admin CRUD + optimistic updates + cascade
- `docs/traces/realtime-gps-evidence-trace.md` — Realtime, GPS, evidence photos
- `docs/traces/finance-trace.md` — finance formulas, settlement, dividend, payout

## User Guides
- `docs/guides/user-guide-collection.md` — driver collection flow
- `docs/guides/user-guide-driver-management.md` — admin driver CRUD
- `docs/guides/user-guide-locations.md` — admin machine management
- `docs/guides/user-guide-approval-settlement.md` — approvals, settlements, debt
- `docs/guides/user-guide-dashboard.md` — dashboard, maps, sync, reports
- `docs/guides/RUNBOOK.md` — operational runbook
- `docs/guides/QUICK-FIX-GUIDE.md` — quick fix reference

## Conventions
- **i18n**: admin UI strings live in `i18n/zh.ts` (Chinese), driver UI strings in `i18n/sw.ts` (Swahili). Shared constants in `types.ts` `TRANSLATIONS`.
- **UUID**: use `safeRandomUUID()` from `types.ts`, not `crypto.randomUUID()` directly.
- **Image resize**: use `resizeImage()` from `types.ts`, do not duplicate.
- **Case IDs**: call `normalizeCaseId()` from `services/supportCaseService.ts` at any service boundary.
- **High-frequency writes**: collection submit and finance calc go through RPCs (`submit_collection_v2`, `calculate_finance_v2`), not direct table upserts.
- **Offline-first**: save with `isSynced: false`, mark synced after Supabase upsert succeeds.
- **RLS scoping**: `transactions`/`daily_settlements` are role-scoped — admin sees all rows, driver sees only own via `get_my_role()` / `get_my_driver_id()`.
- **Database changes**: new file under `supabase/migrations/` only — never edit `BAHATI_COMPLETE_SETUP.sql`.

## Pitfalls
- `supabase.functions.invoke` has NO default timeout → use Promise.race
- `isOnline` defaults to `false` on cold start → 5-10s offline false-positive
- React Query `setQueriesData` with prefix matches ALL scopes
- SECURITY DEFINER functions must set `search_path = public, pg_temp`; add `auth` only when calling `auth.uid()`
- ON CONFLICT DO NOTHING can silently drop duplicates
- PWA: app registers `sw.js` — changes to caching/sync must stay service-worker compatible
- Node via x-cmd: `. ~/.x-cmd.root/X` before any npm command
- Android/Termux: use @rolldown/binding-linux-arm64-gnu, not android-arm64
