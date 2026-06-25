# Deploying V-Aid

Architecture: **Next.js 16 + `@neondatabase/serverless` + better-auth.** The data
driver speaks Neon's protocol, so the production database must be **Neon**
(cloud). Recommended host: **Vercel + Neon**.

> ⚠️ You are testing on **real patient data**. Do the **Pre-flight checklist**
> at the bottom before any patient uses it.

---

## 1. Database — Neon

1. Create a project at neon.tech → copy the **pooled** connection string.
2. Apply the schema:
   ```sh
   psql "<NEON_CONNECTION_STRING>" -f apps/web/db/schema.sql
   ```
   (Or paste `apps/web/db/schema.sql` into the Neon SQL editor.)
3. Neon provides TLS in transit + encryption at rest by default.

## 2. Host — Vercel

1. Import the repo. Set **Root Directory = `apps/web`** (monorepo).
2. Framework preset: **Next.js**. Build/install use the repo's yarn setup.
3. Set the environment variables below (Production scope).

### Required env vars (Production)

| Var | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `BETTER_AUTH_URL` | `https://your-domain.com` (your real HTTPS origin) |
| `BETTER_AUTH_SECRET` | a fresh `openssl rand -base64 48` |
| `OPENROUTER_API_KEY` | a **rotated** key (the dev one was shared in chat) |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` |

### Do NOT set in production
`NEON_LOCAL_PROXY`, `DEV_AUTH_BYPASS`, `NEXT_PUBLIC_DEV_AUTH_BYPASS`,
`NEXT_PUBLIC_DISABLE_PWA`. Omitting these gives you **real Neon + enforced auth +
PWA on**. (`DISABLE_THIRD_PARTY_AI=1` is optional — see the DPDP note.)

4. Deploy. HTTPS is automatic and **required** (auth cookies are Secure).

## 3. Bootstrap the first admin

Staff roles are admin-assigned, so grant the first admin directly. Sign up in
the app, then:

```sh
psql "<NEON_CONNECTION_STRING>" \
  -c "UPDATE \"user\" SET role='admin' WHERE lower(email)=lower('you@clinic.com');"
```

(Or `DATABASE_URL=… node apps/web/scripts/grant-admin.mjs you@clinic.com <clinicId>`.)
That admin can then add doctors/receptionists from **Clinic → Admin**, and set
the Rx header there.

## 4. Seed a clinic

```sh
psql "<NEON_CONNECTION_STRING>" -c \
  "INSERT INTO clinics (name, address, default_language) VALUES ('Your Clinic','City','Hindi');"
```

---

## Pre-flight checklist (before real patient data)

- [x] **Server-side authorization** enforced on every route (done)
- [x] **Audit log** of patient-record access (done — `audit_log` table)
- [x] **Erasure on consent withdrawal** + admin subject-erasure (done — DPDP)
- [ ] **Remove dev flags** — confirm `DEV_AUTH_BYPASS` / `NEXT_PUBLIC_DEV_AUTH_BYPASS`
      / `NEXT_PUBLIC_DISABLE_PWA` / `NEON_LOCAL_PROXY` are **unset** in prod
- [ ] **Rotate secrets** — new `BETTER_AUTH_SECRET`; new `OPENROUTER_API_KEY`
- [ ] **HTTPS** — verified (Vercel default)
- [ ] **DB hardening** — Neon TLS + at-rest encryption (default); restrict access
- [ ] **DPDP / third-party AI** — either sign a data-processing agreement with
      Google (Gemini via OpenRouter), or set `DISABLE_THIRD_PARTY_AI=1` to keep
      all transcripts in-house (deterministic local structuring only)
- [ ] **First admin** bootstrapped; seed clinic created

## DPDP data flows (know what leaves your infra)

- **In-house (never leaves):** all patient records live in your Neon DB.
- **Leaves to OpenRouter → Google Gemini:** the intake **transcript** (for
  translation/structuring) and patient **answers** (for adaptive follow-ups),
  unless `DISABLE_THIRD_PARTY_AI=1`. Question translation sends only the static
  English questions (no PII).
- **Erasure:** withdrawing consent erases that visit's intake; `DELETE
  /api/patients/<id>/data` (admin) erases a patient's health content + redacts
  PII. Visit/prescription shells + the audit log are retained.
