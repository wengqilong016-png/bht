# ADR: Stage 13 — support caseId lookup indexes

## Status
Accepted

## Context
Stages 11A through 11D introduced `case_id` normalization, data cleanup,
and a NOT VALID foreign-key constraint linking `support_audit_log.case_id`
to `support_cases.id`.

Support case detail views and audit trail listings frequently filter on
`case_id` (or `id` in `support_cases`). Without dedicated indexes these
queries rely on sequential scans or the primary-key index alone, which
does not cover canonical (case-insensitive, trimmed) lookups.

## Decision
Add a narrowly scoped Stage 13 migration that creates three performance
indexes without altering the schema or application behavior.

### Canonical lookup dimension

The expression indexes use `lower(btrim(...))` so that queries using the
same canonical form benefit from an index scan regardless of surrounding
whitespace or letter case in the stored value.

### Indexes introduced

| Index | Table | Expression / Columns | Filter |
|---|---|---|---|
| `support_cases_id_canonical_lookup_idx` | `support_cases` | `(lower(btrim(id)))` | — |
| `support_audit_log_case_id_canonical_lookup_idx` | `support_audit_log` | `(lower(btrim(case_id)))` | `WHERE case_id IS NOT NULL` |
| `support_audit_log_case_id_created_at_idx` | `support_audit_log` | `(case_id, created_at DESC)` | `WHERE case_id IS NOT NULL` |

### Query patterns supported

- **Canonical case lookup** — `WHERE lower(btrim(id)) = lower(btrim($1))`
  on `support_cases`.
- **Canonical audit log filter** — `WHERE lower(btrim(case_id)) = lower(btrim($1))`
  on `support_audit_log`.
- **Audit trail newest-first** — `WHERE case_id = $1 ORDER BY created_at DESC`
  on `support_audit_log`.

## Included
- three CREATE INDEX IF NOT EXISTS statements in a single migration file
- partial-index predicates (`WHERE case_id IS NOT NULL`) to skip null rows
- focused tests validating the migration SQL content
- RUNBOOK section for Stage 13

## Excluded
- no schema redesign
- no UI changes
- no service logic changes
- no foreign-key changes
- no caseId semantic changes
