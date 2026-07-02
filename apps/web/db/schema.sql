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

-- AI structuring provenance: which tier produced the accepted note
-- ('openrouter' | 'platform' | 'local') and whether structuring succeeded
-- ('ok' | 'failed'). Powers the note-quality/drift metrics.
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS structuring_source text;
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS structuring_status text NOT NULL DEFAULT 'ok';

-- Note lifecycle: the doctor is the author. AI output lands as 'ai_draft';
-- doctor edits move it to 'doctor_reviewed'; signing makes it 'signed' (and
-- records who/when). A visit cannot close with an unsigned note.
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS note_status text NOT NULL DEFAULT 'ai_draft';
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS signed_by text;
ALTER TABLE intake_sessions ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- Full version trail — every save writes a new row; nothing is overwritten.
-- Rows after signing carry is_addendum=true (dated addenda, not mutations).
CREATE TABLE IF NOT EXISTS note_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_session_id    uuid NOT NULL,
  version_no           integer NOT NULL,
  structured_note_json jsonb,
  edited_by            text,
  edited_at            timestamptz NOT NULL DEFAULT now(),
  change_summary       text,
  is_addendum          boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_note_versions_session ON note_versions (intake_session_id, version_no);

-- Field-level AI-vs-doctor diffs — the training-signal store (no UI yet).
CREATE TABLE IF NOT EXISTS note_edits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_session_id uuid NOT NULL,
  field             text NOT NULL,
  ai_value          text,
  doctor_value      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

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

-- ABDM verification (3.3) + family accounts. abha_verified is set once the ABDM
-- sandbox confirms the number/address. One phone => one account with multiple
-- patient_profiles (relationship + managed_by point at the primary profile).
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS abha_verified boolean NOT NULL DEFAULT false;

-- Patient's favourite clinics (quick no-QR check-in).
CREATE TABLE IF NOT EXISTS patient_favorites (
  patient_id text NOT NULL,
  clinic_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, clinic_id)
);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS abha_verified_at timestamptz;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS relationship text DEFAULT 'self';
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS managed_by text;

CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id         text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  registration_no text,
  specialty       text
);

-- Doctor verification + onboarding. A doctor stays 'pending' until an admin
-- verifies their registration against the issuing council's register; until
-- then they can view the queue but cannot SIGN notes or issue prescriptions
-- (enforced in auth-guard). council + signature_name print on the Rx / note.
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS council text;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS signature_name text;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS registry_ref text;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Ambient consult scribe (2.5). Recording requires BOTH a patient
-- 'consult_recording' consent AND this doctor opt-in. Audio + raw transcript
-- live ONLY in consult_recordings and are hard-deleted on visit close; only the
-- doctor-signed summary survives (inside the note).
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS consult_recording_optin boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS consult_recordings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL,
  status          text NOT NULL DEFAULT 'recording',
  transcript      text,
  chunk_refs_json jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consult_recordings_visit ON consult_recordings (visit_id);
CREATE INDEX IF NOT EXISTS idx_consult_recordings_created ON consult_recordings (created_at);

-- Staff invitations — the grant-only path to a staff role. An admin mints an
-- invite scoped to their clinic; accepting a valid, unexpired token is the only
-- way to acquire a staff role (self-signups are always 'patient').
CREATE TABLE IF NOT EXISTS invitations (
  token       text PRIMARY KEY,
  email       text,
  phone       text,
  role        text NOT NULL,
  clinic_id   uuid NOT NULL,
  invited_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by text
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations (lower(email));

-- ─────────────── FHIR-aligned coded clinical resources (3.1) ────────────────
-- Field names align to FHIR from day one; full FHIR serialization can come
-- later. Populated when the doctor SIGNS a note (narrative -> coded data).
-- structured_note_json stays as the narrative source of truth.
CREATE TABLE IF NOT EXISTS conditions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        text NOT NULL,
  visit_id          uuid,
  code_icd10        text,
  display_text      text NOT NULL,
  clinical_status   text NOT NULL DEFAULT 'active',   -- active | resolved | inactive
  onset_date        date,
  recorded_by       text,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  verified_by_doctor boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_conditions_patient ON conditions (patient_id);
CREATE INDEX IF NOT EXISTS idx_conditions_icd10 ON conditions (code_icd10);

CREATE TABLE IF NOT EXISTS observations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     text NOT NULL,
  visit_id       uuid,
  code           text,             -- LOINC where known, else a local code
  display_text   text,
  value_quantity numeric,
  unit           text,
  effective_at   timestamptz NOT NULL DEFAULT now(),
  source         text              -- 'vitals' | 'lab' | ...
);
CREATE INDEX IF NOT EXISTS idx_observations_patient ON observations (patient_id);

CREATE TABLE IF NOT EXISTS medication_statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  text NOT NULL,
  visit_id    uuid,
  drug_name   text NOT NULL,
  rxnorm_code text,
  dose        text,
  frequency   text,
  status      text NOT NULL DEFAULT 'active',      -- active | stopped
  source      text NOT NULL DEFAULT 'intake',      -- intake | prescription
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medstmt_patient ON medication_statements (patient_id);

CREATE TABLE IF NOT EXISTS allergy_intolerances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        text NOT NULL,
  visit_id          uuid,
  substance         text NOT NULL,
  reaction          text,
  severity          text NOT NULL DEFAULT 'unknown', -- mild | moderate | severe | unknown
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  verified_by_doctor boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_allergy_patient ON allergy_intolerances (patient_id);

-- Problems the patient/doctor marked resolved, so they stop appearing as active
-- in the rolled-up summary (note-derived problems have no coded status).
CREATE TABLE IF NOT EXISTS resolved_problems (
  patient_id   text NOT NULL,
  problem_norm text NOT NULL,
  resolved_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, problem_norm)
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

-- Vitals — every note can carry objective numbers. All measurements are
-- nullable (walk-in clinics often lack equipment); DB CHECK constraints reject
-- impossible values (mirrored in zod). entry_source distinguishes staff-measured
-- from patient self-reported so they are never silently mixed.
CREATE TABLE IF NOT EXISTS vitals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      uuid NOT NULL,
  patient_id    text NOT NULL,
  recorded_by   text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  systolic_bp   integer,
  diastolic_bp  integer,
  heart_rate    integer,
  temperature_c numeric(4,1),
  resp_rate     integer,
  spo2          integer,
  weight_kg     numeric(5,1),
  height_cm     numeric(5,1),
  glucose_mgdl  integer,
  entry_source  text NOT NULL DEFAULT 'staff',
  CONSTRAINT vitals_spo2_range CHECK (spo2 IS NULL OR (spo2 BETWEEN 50 AND 100)),
  CONSTRAINT vitals_temp_range CHECK (temperature_c IS NULL OR (temperature_c BETWEEN 30 AND 45)),
  CONSTRAINT vitals_hr_range CHECK (heart_rate IS NULL OR (heart_rate BETWEEN 20 AND 300)),
  CONSTRAINT vitals_sys_range CHECK (systolic_bp IS NULL OR (systolic_bp BETWEEN 50 AND 300)),
  CONSTRAINT vitals_dia_range CHECK (diastolic_bp IS NULL OR (diastolic_bp BETWEEN 20 AND 200))
);
CREATE INDEX IF NOT EXISTS idx_vitals_visit ON vitals (visit_id);

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

-- Pilot instrumentation (3.5): lightweight event log kept in Postgres (no
-- third-party analytics). Powers the pilot metrics on the analytics dashboard.
CREATE TABLE IF NOT EXISTS analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event         text NOT NULL,   -- intake_started | intake_completed | note_signed | rx_shared | intake_abandoned
  visit_id      uuid,
  clinic_id     text,
  metadata_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_clinic ON analytics_events (clinic_id, event);

-- Ops (3.4): per-clinic daily AI spend (cost controls) + cold audit archive +
-- consent soft-delete (30-day recovery window before hard purge).
CREATE TABLE IF NOT EXISTS ai_usage (
  clinic_id text NOT NULL,
  day       date NOT NULL DEFAULT current_date,
  calls     integer NOT NULL DEFAULT 0,
  spend_usd numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, day)
);
CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_log INCLUDING ALL);
ALTER TABLE consent ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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
