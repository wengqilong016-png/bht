# ADR: Stage 11E — support FK validation prep

## Status
Proposed

## Context
Stage 11D added `support_audit_log_case_id_fkey` as `NOT VALID`, after Stage 11A soft hardening and Stage 11B/11C data cleanup established a clean baseline.

Before running `VALIDATE CONSTRAINT`, the project needs a narrowly scoped preparation step that documents the final go/no-go checks, operator verification workflow, and rollback guidance.

## Decision
Open a narrowly scoped Stage 11E preparation stage focused on validation readiness only.

## Included
- final pre-validation checklist for `support_audit_log_case_id_fkey`
- operator / runbook instructions for when `VALIDATE CONSTRAINT` is safe to run
- rollback / stop conditions for Stage 11E
- minimal docs or helper guidance needed for the validation step

## Excluded
- no actual `VALIDATE CONSTRAINT` in this prep stage
- no new FK design changes
- no support workflow redesign
- no unrelated service, UI, or realtime changes
