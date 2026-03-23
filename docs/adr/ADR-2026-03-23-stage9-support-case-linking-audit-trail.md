# ADR: Stage 9 — support case linking and audit trail

## Status
Proposed

## Context
Stages 1 through 8.1 established a stable operational foundation for preview correctness, server-authoritative writes, offline replay safety, diagnostics, export workflow, and background health alerts.

The next feature stage should be narrowly focused on support operations rather than infrastructure expansion. The highest-value step is to connect diagnostics and recovery workflows to support cases, while adding lightweight operator-visible audit history.

## Decision
Open a clean stage 9 focused on support case linking and audit trail only.

## Included
- lightweight support case entity or linkage model
- linking diagnostics, alerts, exports, and manual recovery actions to support cases
- operator-visible audit trail for support and recovery actions
- minimal admin/support UI needed to view and navigate support linkage and history
- focused tests and documentation updates for the stage 9 scope

## Excluded
- automatic remediation
- bulk remediation tooling
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup
- unrelated observability expansion
- mixing in additional stabilization work unless directly required by stage 9
