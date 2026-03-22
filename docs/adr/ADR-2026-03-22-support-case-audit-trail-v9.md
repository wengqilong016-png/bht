# ADR: Support case linking and audit trail v9

## Status
Proposed

## Context
Stages 1 to 8 improved preview consistency, authoritative writes, replay safety, diagnostics visibility, manual replay, fleet-wide diagnostics, export workflow, and background health alerts.
The next gap is tracking how support and admins investigate, export, and act on queue health issues over time.

## Decision
Stage 9 focuses on support case linking and audit trail for diagnostics, exports, alerts, and manual recovery actions.

## Included
- support case linkage for diagnostics / alerts / exports where appropriate
- read-friendly audit trail for key admin/support actions
- focused tests
- minimal Supabase-side storage if needed

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup
- automatic remediation
- bulk remediation tooling
