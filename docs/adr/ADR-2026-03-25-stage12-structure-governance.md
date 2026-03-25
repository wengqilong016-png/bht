# ADR: Stage 12 — Structure Governance (Realtime + Shell boundary)

## Status
Proposed

## Context
After Stage 11, the system reaches strong data consistency (FK validated). However, structural risks remain:

- duplicate realtime subscriptions (global + hooks)
- heavy shells (AppAdminShell / AppDriverShell)
- UI directly orchestrating data writes (SubmitReview)

These increase coupling and make future stages risky.

## Decision
Introduce Stage 12 as a **structure governance phase** focused on boundaries and ownership.

## Goals
1. Single realtime subscription entry point
2. Clear separation: UI vs service vs data orchestration
3. Reduce shell responsibility (navigation vs orchestration)

## Non-goals
- no feature expansion
- no schema changes
- no support workflow redesign

## Plan (high-level)

### 12A — Realtime unification
- centralize subscriptions
- remove duplicate listeners

### 12B — Submit flow boundary
- move write orchestration from UI → service layer

### 12C — Shell decomposition
- split AppAdminShell / AppDriverShell into:
  - navigation container
  - business orchestration
  - view mapping

## Risks
- accidental behavior change in realtime invalidation
- UI dependency breakage

## Mitigation
- incremental PRs
- tests for critical flows (submit, resolve, queue)

## Success criteria
- no duplicate realtime subscriptions
- UI does not directly call low-level data mutations
- shells reduced in size and responsibility
