# ADR: Stage 12C — shell renderer boundary

## Status
Accepted

## Context
After Stage 12A moved submit orchestration out of `SubmitReview`, and Stage 12B extracted shell-derived state helpers plus the shared loading fallback, the admin and driver shells still contained large inline view-render branches.

Those branches mixed shell concerns with page selection/orchestration concerns:
- `view === ...` rendering trees lived directly in `AppAdminShell` and `AppDriverShell`
- shell files still carried most page-to-view wiring details
- renderer complexity remained inside shell modules even though navigation/state ownership had already been separated

## Decision
Introduce dedicated shell renderer modules:
- `admin/renderAdminShellView.tsx`
- `driver/renderDriverShellView.tsx`

The shells continue to own:
- current `view` state
- header / nav / modal chrome
- lightweight shell-only state

The renderer modules now own:
- view-to-page rendering selection
- page wiring for each view
- dashboard-backed vs standalone page rendering branches

## Included
- extract admin view rendering into `renderAdminShellView.tsx`
- extract driver view rendering into `renderDriverShellView.tsx`
- focused structural tests confirming renderer boundary files exist and centralize view branches
- keep shell behavior unchanged

## Excluded
- no schema changes
- no support workflow changes
- no realtime core changes
- no shell visual redesign
- no business-rule changes
