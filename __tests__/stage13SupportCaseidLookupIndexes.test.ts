import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('stage13 support caseId lookup indexes migration', () => {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260325030000_stage13_support_caseid_lookup_indexes.sql'
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('creates canonical expression index on support_cases(id)', () => {
    expect(sql).toContain('support_cases_id_canonical_lookup_idx');
    expect(sql).toContain('ON public.support_cases ((lower(btrim(id))))');
  });

  it('creates canonical expression index on support_audit_log(case_id) with partial predicate', () => {
    expect(sql).toContain('support_audit_log_case_id_canonical_lookup_idx');
    expect(sql).toContain('ON public.support_audit_log ((lower(btrim(case_id))))');
    // partial index: only rows where case_id is not null
    expect(sql).toMatch(
      /support_audit_log_case_id_canonical_lookup_idx[\s\S]*?WHERE\s+case_id\s+IS\s+NOT\s+NULL/i
    );
  });

  it('creates composite audit trail index on (case_id, created_at DESC) with partial predicate', () => {
    expect(sql).toContain('support_audit_log_case_id_created_at_idx');
    expect(sql).toContain('(case_id, created_at DESC)');
    // partial index: only rows where case_id is not null
    expect(sql).toMatch(
      /support_audit_log_case_id_created_at_idx[\s\S]*?WHERE\s+case_id\s+IS\s+NOT\s+NULL/i
    );
  });

  it('uses CREATE INDEX IF NOT EXISTS for all indexes', () => {
    const indexStatements = sql.match(/CREATE INDEX/gi) ?? [];
    const ifNotExistsStatements = sql.match(/CREATE INDEX IF NOT EXISTS/gi) ?? [];
    expect(indexStatements.length).toBe(3);
    expect(ifNotExistsStatements.length).toBe(3);
  });

  it('does not alter any table or add constraints', () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/ADD\s+CONSTRAINT/i);
  });
});
