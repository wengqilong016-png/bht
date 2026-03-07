# Copilot Instructions for Bahati Jackpots

## Project overview

Bahati Jackpots is a React 19 + TypeScript progressive web app for managing slot-machine collection routes in Tanzania.

- Admin flows are primarily in Chinese (`zh`)
- Driver flows are primarily in Swahili (`sw`)
- Shared UI text lives in `TRANSLATIONS` in `types.ts`

## Tech stack

- Vite 6
- React 19
- TypeScript
- Tailwind CSS via `styles.css` + PostCSS (`tailwind.config.js`, `postcss.config.js`)
- Supabase for persistence
- Leaflet + `react-leaflet` for maps
- Gemini via `@google/genai`
- Offline queue support in `offlineQueue.ts`

## Important files

- `App.tsx` - root state, routing, localStorage mirroring, 20-second sync loop
- `types.ts` - shared interfaces, constants, translations, utility helpers
- `offlineQueue.ts` - IndexedDB/localStorage offline transaction queue
- `supabaseClient.ts` - Supabase client and health check
- `setup_db.sql` - database schema and incremental migrations
- `components/LiveMap.tsx` - Leaflet map UI

## Validation

- Install dependencies with `npm ci`
- Validate changes with `npm run build`
- There is no test suite in this repository

## Repository conventions

- Prefer small, surgical TypeScript changes
- Extend shared types in `types.ts` instead of redefining inline shapes
- Keep admin strings in `zh` and driver strings in `sw` inside `TRANSLATIONS`
- Use `safeRandomUUID()` from `types.ts` instead of `crypto.randomUUID()`
- Follow the offline-first pattern in `App.tsx`: save locally with `isSynced: false`, then mark records synced after Supabase upserts succeed
- Driver collection flows should continue filtering locations by `assignedDriverId`, with fallback behavior when no locations are assigned
- Reuse shared utilities such as `resizeImage()` in `types.ts` instead of duplicating image-processing logic

## Frontend and deployment notes

- `index.tsx` imports `styles.css`; do not switch Tailwind back to a CDN setup
- Vite uses `base: './'` in `vite.config.ts`; keep asset paths relative for both root and subpath deployments
- The app registers `sw.js` for PWA/offline behavior, so changes to caching or sync should preserve service-worker compatibility

## Maps and location behavior

- Machine locations use `Location.coords`
- Driver heartbeat GPS is updated from `App.tsx`
- Submitted collections store GPS on `Transaction.gps`
- Map features use Leaflet with custom `L.divIcon` markers
