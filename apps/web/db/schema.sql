-- ============================================================================
-- V-Aid — canonical database schema (Postgres / Neon-ready)
--
-- Apply to a fresh database before first deploy:
--   psql "$DATABASE_URL" -f apps/web/db/schema.sql
-- (On Neon, DATABASE_URL is the standard pooled connection string.)
--
-- Idempotent: safe to re-run. better-auth columns are camelCase and MUST stay
-- double-quoted.
-- ============================================================================

-- ───────────────────────── better-auth core ────────────────────────────────
CREATE TABLE IF NOT EXISTS "user" (
  "id"            text PRIMARY KEY,
  "name"          text NOT NULL,
  "email"         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image"         text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  "role"          text,        -- patient | receptionist | doctor | admin
  "clinic_id"     text
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"        text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token"     text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz DEFAULT now(),
  "updatedAt"  timestamptz DEFAULT now()
);

-- phoneNumber plugin: phone-OTP sign-in / identity. Unique phone => one account
-- per number, which is what dedupes a patient across clinics.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phoneNumber" text UNIQUE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phoneNumberVerified" boolean DEFAULT false;

-- ───────────────────────── application tables ───────────────────────────────
CREATE TABLE IF NOT EXISTS clinics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  address          text,
  branding_json    jsonb,
  default_language text DEFAULT 'Hindi',
  rx_header_json   jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          text NOT NULL,
  doctor_id           text,
  clinic_id           uuid,
  token_no            text,
  status              text NOT NULL DEFAULT 'CHECKED IN',
  created_at          timestamptz NOT NULL DEFAULT now(),
  checked_in_at       timestamptz DEFAULT now(),
  intake_started_at   timestamptz,
  intake_completed_at timestamptz,
  consult_started_at  timestamptz,
  closed_at           timestamptz
);

CREATE TABLE IF NOT EXISTS intake_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id              uuid NOT NULL,
  language              text,
  audio_refs_json       jsonb,
  transcript_native     text,
  transcript_english    text,
  structured_note_json  jsonb,
  confidence_flags_json jsonb,
  screen_flags_json     jsonb,
  consent_id            text,
  status                text NOT NULL DEFAULT 'PENDING',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Once the consult closes the structured note is locked: later corrections must
-- be dated addenda, not silent overwrites (medico-legal discipline).
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE TABLE IF NOT EXISTS prescriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id             uuid NOT NULL,
  doctor_id            text NOT NULL,
  items_json           jsonb NOT NULL,
  advice               text,
  follow_up_date       date,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  shared_channels_json jsonb
);

CREATE TABLE IF NOT EXISTS documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL,
  visit_id   uuid,
  type       text DEFAULT 'lab_report',
  file_ref   text NOT NULL,
  ocr_text   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id       text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  date_of_birth date,
  sex           text,
  abha_id       text          -- captured for later ABDM mapping; not linked live
);

-- Stable, human-friendly internal patient ID (UHID), minted once per patient
-- and kept for the platform's own record. ABHA (above) is tied to the same row,
-- so a patient without ABHA still has a permanent V-Aid ID we can nudge them to
-- link. The volatile default backfills existing rows on first run.
CREATE SEQUENCE IF NOT EXISTS vaid_uhid_seq START 1001;
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS uhid text UNIQUE
  DEFAULT ('VAID-' || lpad(nextval('vaid_uhid_seq')::text, 6, '0'));

-- ABHA is a cross-clinic identity key: at most one profile may claim a given
-- ABHA (NULLs are unconstrained, so patients without one are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS patient_profiles_abha_uniq
  ON patient_profiles (abha_id) WHERE abha_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id         text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  registration_no text,
  specialty       text
);

-- Rolled-up longitudinal summary, regenerated when a consult closes. Carries
-- the patient's problems, current medications and allergies forward across
-- visits so the doctor gets glance-value instead of a stack of cards.
CREATE TABLE IF NOT EXISTS patient_summary (
  patient_id       text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  problems_json    jsonb,
  medications_json jsonb,
  allergies_json   jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- DPDP consent record
CREATE TABLE IF NOT EXISTS consent (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   text,
  visit_id     uuid,
  scope        text,
  version      text,
  text_shown   text,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);

-- DPDP audit trail (every access to a patient record)
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text,
  action        text NOT NULL,
  entity        text,
  entity_id     text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Expiring share links for prescriptions. A random 128-bit token resolves to a
-- prescription for a limited window (public /rx/[token] view). Raw-UUID
-- prescription URLs are no longer publicly resolvable.
CREATE TABLE IF NOT EXISTS share_tokens (
  token           text PRIMARY KEY,
  prescription_id uuid NOT NULL,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_rx ON share_tokens (prescription_id);

-- Fixed-window rate-limit counters (Postgres-backed; see src/lib/rate-limit.ts).
-- Neon-serverless friendly: no Redis assumed. Expired windows are swept
-- opportunistically on write.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters (window_start);

-- ───────────────────────── indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visits_clinic    ON visits (clinic_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient   ON visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_intake_visit     ON intake_sessions (visit_id);
CREATE INDEX IF NOT EXISTS idx_rx_visit         ON prescriptions (visit_id);
CREATE INDEX IF NOT EXISTS idx_docs_visit       ON documents (visit_id);
CREATE INDEX IF NOT EXISTS idx_docs_patient     ON documents (patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_patient  ON consent (patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_visit    ON consent (visit_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time       ON audit_log (created_at DESC);
