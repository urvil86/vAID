# V-Aid — Operations runbook

## Health & monitoring

- **Health check:** `GET /api/health` → `{ status, checks: { db, ai, migrations } }`
  (200 ok / 503 degraded). Point uptime monitoring here.
- **Structured logs:** `src/lib/logger.ts` emits JSON lines (level, route,
  visit_id, duration_ms, outcome; AI calls carry model/tier/latency/tokens/cost).
  **No PII** is ever logged.
- **Error tracking (Sentry):** env-gated — set `SENTRY_DSN` (server) +
  `NEXT_PUBLIC_SENTRY_DSN` (client) and initialise in `instrumentation.ts` /
  the root layout. Configure `beforeSend` to scrub transcripts, phone numbers,
  and note content; tag events with `route` + `clinic_id` only. (Wrapper is the
  remaining wire-in; the logger already gives structured, PII-free events.)

## AI cost controls

- Per-clinic daily spend in `ai_usage` (`src/lib/ai-cost.ts`). Budget
  `AI_DAILY_BUDGET_USD` (default 5). Over budget → structuring degrades to the
  deterministic local tier (never blocks intake); surface a banner on the admin
  dashboard.

## Retention & maintenance

- **Manual, idempotent:** `POST /api/admin/maintenance` (admin) →
  - archives `audit_log` rows older than `AUDIT_RETENTION_DAYS` (default 1095 =
    3 years, aligned to Indian medical-record norms) into `audit_log_archive`;
  - hard-purges consents soft-deleted (>30-day recovery window) — set
    `consent.deleted_at` to soft-delete;
  - safety-net purge of `consult_recordings` older than 24h (2.5).
- Never run destructive maintenance on a schedule — manual trigger only for now.

## Backups (Neon PITR)

- Neon provides point-in-time recovery. **Restore:** Neon console → Branches →
  Restore to a timestamp; repoint `DATABASE_URL` if restoring to a new branch.
- Re-run `apps/web/db/schema.sql` after any restore to a fresh DB (idempotent).

## Secrets rotation runbook

1. Rotate the value at the provider (Neon password, OpenRouter key,
   `BETTER_AUTH_SECRET`, Sarvam/Twilio/ABDM creds).
2. Update Vercel → Settings → Environment Variables (Production).
3. Redeploy. `BETTER_AUTH_SECRET` rotation invalidates existing sessions
   (users re-login) — expected.

## Incident: "a note is wrong in a real consult"

1. The signed note is immutable; corrections are **dated addenda** (POST
   `/api/intake/note` on a signed session) — never silent edits.
2. Notify the treating doctor; they add the addendum with the correction.
3. Every access + change is in `audit_log` (actor, action, entity, ip).

## Deploy checklist

1. Run the sprint's migration SQL on Neon (idempotent).
2. Confirm **no** `DEV_AUTH_BYPASS` / `NEXT_PUBLIC_DEV_AUTH_BYPASS` in Production
   (the boot asserts refuse to start otherwise — Sprint 1.1).
3. `BETTER_AUTH_SECRET` ≥ 32 chars present.
4. Redeploy; verify `GET /api/health` returns `status: ok`.
