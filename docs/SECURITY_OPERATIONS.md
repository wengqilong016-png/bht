# Security Operations Guide

This document covers the security posture of the Bahati Jackpots project and the steps required to maintain it.

---

## 1. Credential Rotation

### Why rotation is needed

Past commits (e.g. PR #99) embedded Supabase credentials directly in source code. Even after removing them from the latest commit, the values remain visible in Git history. Anyone with read access to the repository can retrieve them.

**Immediate actions required:**

1. **Rotate the Supabase `anon` key**
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → select your project.
   - Go to **Settings → API**.
   - Click **Regenerate** next to the `anon` / `public` key.
   - Copy the new key.
   - Update your Vercel environment variables (see §3 below).
   - Update any `.env.local` files on developer machines.

2. **Rotate the Supabase service-role key** (if it was ever committed)
   - Follow the same steps as above but for the `service_role` key.
   - Update all server-side environment variables that use this key.

3. **Revoke any exposed Google Gemini API keys**
   - Visit [Google AI Studio → API Keys](https://aistudio.google.com/app/apikey).
   - Delete the old key and create a new one.
   - Update Vercel + local `.env.local`.

---

## 2. Cleaning `BAHATI_DATA_BACKUP.json` from Git History

The file `BAHATI_DATA_BACKUP.json` (~15.8 MB) was committed to the repository and contains production data. Adding it to `.gitignore` only prevents future commits — the file remains in Git history.

**This PR does not perform the history rewrite.** Execute the steps below manually when ready.

> ⚠️ History rewriting requires a force-push and will invalidate existing clones / open PRs. Coordinate with all team members first.

### Option A — BFG Repo-Cleaner (recommended, fastest)

```bash
# 1. Download BFG
curl -LO https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 2. Make a fresh mirror clone
git clone --mirror https://github.com/wengqilong016-png/B-ht.git B-ht.git

# 3. Delete the file from all history
java -jar bfg-1.14.0.jar --delete-files BAHATI_DATA_BACKUP.json B-ht.git

# 4. Expire reflogs and GC
cd B-ht.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force-push to GitHub
git push --force
```

### Option B — git-filter-repo

```bash
pip install git-filter-repo
git filter-repo --path BAHATI_DATA_BACKUP.json --invert-paths
git push origin --force --all
git push origin --force --tags
```

After the force-push, ask all collaborators to re-clone the repository rather than pulling, as local histories will have diverged.

---

## 3. Setting Environment Variables

### Vercel

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project.
2. Go to **Settings → Environment Variables**.
3. Add (or update) the following variables for **Production**, **Preview**, and **Development** environments:

   | Variable | Description |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase `anon` / `public` key |
   | `VITE_GEMINI_API_KEY` | Google Gemini API key |
   | `VITE_STATUS_API_BASE` | Optional: base URL for the status API |
   | `VITE_INTERNAL_API_KEY` | Optional: API key for the status API |

4. Click **Save** and trigger a new deployment.

> **Never** put the `service_role` key in a `VITE_*` variable — it grants admin-level database access and must stay server-side only.

### GitHub Actions (CI/CD secrets)

1. Open your repository → **Settings → Secrets and variables → Actions**.
2. Add or update the same `VITE_*` secrets from the Vercel table above (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_STATUS_API_BASE`, `VITE_INTERNAL_API_KEY`).
3. The CI workflow (`.github/workflows/ci.yml`) reads these secrets during the build step.

### Local Development

```bash
cp .env.example .env.local
# Fill in the values in .env.local — this file is gitignored
```

---

## 4. Preventing Future Credential Leaks

- The root `.gitignore` now ignores all `.env*` files (except `.env.example`) and common backup/export formats.
- Never commit files matching: `*backup*`, `*BACKUP*`, `*.dump`, `*.sql.gz`, `*.sqlite`, `*.db`, `*.jsonl`, `*.ndjson`.
- Use `safeRandomUUID()` from `types.ts` — do not import Node/browser crypto APIs directly.
- The CI workflow runs `npm run typecheck && npm run build` on every push, which will fail if secrets are missing from the environment.

---

## 5. References

- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
- [Supabase API Settings](https://supabase.com/dashboard/project/_/settings/api)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
