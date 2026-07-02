# V-Aid: Antigravity Build Prompts

Source: Product Readiness Audit, 1 July 2026. Repo: `vaid` monorepo (`apps/web` Next.js 16 App Router, `apps/mobile` Expo 54, schema at `apps/web/db/schema.sql`).

Run the prompts in order. Each is self-contained and copy-paste ready. Sprint 1 makes the app safe to show a clinic. Sprint 2 makes the note trustworthy. Sprint 3 makes the record an asset. Do not reorder Sprint 1; everything else depends on it.

---

## Shared context block

Paste this at the top of every new Antigravity session before the prompt:

```
CONTEXT: You are working on V-Aid, a clinical intake product for Indian walk-in clinics.
Monorepo: apps/web (Next.js 16, App Router, Neon Postgres via Kysely, better-auth v1.1.7),
apps/mobile (Expo 54). Canonical schema: apps/web/db/schema.sql.
Key paths:
- Auth: src/lib/auth.ts, src/lib/auth-guard.ts, src/lib/dev-auth.ts
- AI: src/lib/openrouter.ts, src/app/api/intake/structure/route.ts
- Intake: src/app/patient/intake/[visitId]/page.tsx
- Consult: src/app/clinic/consult/[visitId]/page.tsx
- Audit: src/lib/audit.ts; Consent: src/app/api/consent/route.ts
Ground rules for every change:
1. This handles patient health data under India's DPDP Act. Security and audit
   trails are non-negotiable. Every data access gets an audit_log entry.
2. The AI structures, it never diagnoses. Keep that separation in all prompts and UI.
3. Do not break the mobile auth bridge: the postMessage contract between
   apps/web/src/app/api/auth/expo-web-success/route.ts and
   apps/mobile/src/utils/auth/AuthWebView.tsx must stay in sync.
4. Additive schema changes only: new tables and columns, no destructive
   migrations. Update apps/web/db/schema.sql and write a migration file.
5. After each change, run the type check and lint, and list every file you touched
   with a one-line reason.
```

---

# SPRINT 1 — Safe to show a real clinic

## Prompt 1.1 — Kill the auth bypass and guard it permanently

```
TASK: Remove the DEV_AUTH_BYPASS security hole and make it impossible to ship enabled.

Current state: src/lib/dev-auth.ts falls back to a seeded super-user doctor whenever
DEV_AUTH_BYPASS=1 and no real session exists. It is currently ON in the live .env.
Every guard in src/lib/auth-guard.ts is short-circuited by it.

Do the following:

1. In src/lib/dev-auth.ts, hard-gate the bypass so it can only activate when ALL of:
   - process.env.NODE_ENV !== 'production'
   - process.env.VERCEL_ENV is undefined or 'development'
   - DEV_AUTH_BYPASS === '1'
   If DEV_AUTH_BYPASS is set in a production build, throw at startup with a clear
   error message rather than silently ignoring it. Fail loud, not open.

2. Add a startup assertion module (src/lib/env-assertions.ts) imported from the root
   layout or instrumentation.ts that validates the environment on boot:
   - In production: DEV_AUTH_BYPASS must be unset, BETTER_AUTH_SECRET must be present
     and at least 32 chars, OPENROUTER_API_KEY must be present.
   - Log a single structured line confirming which assertions passed.

3. When the bypass IS legitimately active in local dev, render a persistent red
   banner on every page ("AUTH BYPASS ACTIVE — DEV ONLY") so it can never be
   mistaken for a real session during a demo.

4. Search the whole repo for any other reference to the seeded demo doctor or
   bypass logic and gate those identically.

5. Update .env.example with comments explaining the guard.

ACCEPTANCE:
- Setting DEV_AUTH_BYPASS=1 with NODE_ENV=production crashes the boot with a clear error.
- Local dev with the flag on shows the red banner.
- All auth-guard functions behave identically to before for real sessions.
- No test or seed script depends on the bypass in a way that breaks CI.

DO NOT: touch the better-auth session logic, the phone-OTP flow, or the mobile
postMessage bridge.
```

Manual step for you, not Antigravity: rotate the OpenRouter key, the better-auth signing secret, and the platform token now, and move them into your host's managed secrets (Vercel env vars). The old values in `.env` are burned the moment anyone else has seen that file.

## Prompt 1.2 — Rate limiting on OTP and AI endpoints

```
TASK: Add rate limiting. There is currently none anywhere. The two exposures:
the 6-digit phone OTP can be brute-forced (no attempt counter), and the AI
endpoints are an uncapped bill and a data-exfiltration path.

Implementation:

1. Create src/lib/rate-limit.ts with a fixed-window limiter backed by Postgres
   (a rate_limit_counters table: key, window_start, count), since the app runs on
   Neon serverless and we cannot assume Redis. Design the interface so a Redis or
   Upstash backend can be swapped in later behind the same function signature:
   checkRateLimit(key: string, opts: { windowMs, max }): Promise<{ ok, retryAfterMs }>.

2. Apply limits:
   - OTP send (better-auth phoneNumber plugin route): max 3 sends per phone number
     per 15 minutes, and max 10 per IP per hour.
   - OTP verify: max 5 attempts per phone number per code lifetime; on the 5th
     failure invalidate the code and require a re-send.
   - /api/intake/structure, /api/intake/followup, /api/intake/translate-questions:
     max 20 requests per visit per hour, plus a per-IP cap of 60/hour.
   - /api/auth/* generally: 30 requests per IP per minute.

3. On limit breach return 429 with a Retry-After header and a JSON body the
   frontend can render. Add a friendly patient-facing message in the intake flow
   ("Too many attempts, please wait a minute") rather than a raw error.

4. Log every 429 to audit_log with action 'RATE_LIMITED', the route, and the key
   type (never log the raw phone number, use a hash).

5. Add the rate_limit_counters table to apps/web/db/schema.sql plus a migration,
   and a cleanup: expired windows deleted opportunistically on write.

ACCEPTANCE:
- A script hammering OTP verify gets locked out after 5 attempts and the code is dead.
- AI endpoints return 429 past the cap; the intake UI shows the wait message.
- Normal single-patient flow never hits a limit.

DO NOT: rate-limit the doctor queue polling (5s interval is by design) or
GET /api/visits.
```

## Prompt 1.3 — Close the authorization holes (clinic scoping, IDOR, CSRF, share links)

```
TASK: Close every cross-tenant authorization hole found in the security audit.
The pattern behind all of them: routes trust client-supplied IDs without checking
they belong to the caller's clinic.

Fix each of these:

1. PUBLIC CLINIC LEAK — src/app/api/clinics/route.ts and
   src/app/api/clinics/[clinicId]/route.ts currently return full clinic records,
   including rx_header_json and branding, to anyone, and allow enumeration.
   - The public check-in flow only needs: clinic name, display branding needed to
     render the check-in page, and default_language. Create a minimal public DTO
     with exactly those fields and return only that from unauthenticated calls.
   - Full clinic records require an authenticated staff session scoped to that clinic.
   - Remove any listing endpoint that enumerates all clinics without auth.

2. CROSS-CLINIC STAFF LISTING — src/app/api/admin/staff/route.ts lets an admin
   pass an empty clinicId and list staff across all clinics. Ignore any
   client-supplied clinicId entirely: always derive the clinic from the
   authenticated admin's own user record. If the session user has no clinic_id,
   return 403.

3. PATIENT PROFILE IDOR — src/app/api/patients/[patientId]/data/route.ts lets
   staff fetch any patient by ID. Add a scoping check: the patient must have at
   least one visit at the caller's clinic, OR an active cross-clinic consent
   record covering the caller's clinic. Deny with 404 (not 403, avoid confirming
   the ID exists). Audit-log every denial with action 'ACCESS_DENIED'.

4. MERGE-PATIENTS SCOPING — src/app/api/admin/merge-patients/route.ts: both
   patient records being merged must have visit history at the caller's clinic.
   Log the full merge (both IDs, actor, before/after UHIDs) to audit_log.

5. POSTMESSAGE WILDCARD — src/app/api/auth/expo-web-success/route.ts posts the
   session token to origin '*'. Replace with an explicit allowlist built from the
   trusted origins already configured in src/lib/auth.ts. Update the listener in
   apps/mobile/src/utils/auth/AuthWebView.tsx to verify event.origin against the
   same list. Keep the message shape identical.

6. SCHEMA VALIDATION — add zod. Create src/lib/validation/ with schemas for every
   POST/PUT body: prescriptions (items array with typed drug entries), branding,
   intake answers, consent, profile updates, merge requests. Parse at the top of
   each route; return 400 with field-level errors on failure. Reject unknown keys.

7. CSRF — better-auth covers its own endpoints only. For all other state-changing
   routes, enforce an origin check: reject requests whose Origin/Referer is not in
   the trusted origins list, exempting the bearer-token path used by mobile.

8. SHARE LINKS — prescription share links are raw UUID URLs with no expiry.
   Add a share_tokens table (token, prescription_id, expires_at, created_by).
   /api/share mints a random 128-bit token with a 72-hour expiry; the public
   prescription view resolves the token, checks expiry, and audit-logs the view.
   Old raw-UUID links stop resolving publicly.

ACCEPTANCE for each item: write a small test or reproduction script that
demonstrates the hole is closed (e.g., staff from clinic A requesting a clinic-B
patient gets 404 and an audit entry). List them all at the end.

DO NOT: change the patient-facing check-in UX, break the mobile auth bridge
message shape, or alter the queue polling.
```

## Prompt 1.4 — Doctor edit, draft labeling, and sign-off

The audit's most important finding. The doctor is currently a reader, not an author: the note is read-only in the consult view, and "Mark Visit Done" locks the AI's output as the medical record.

```
TASK: Make the doctor the author of the medical record. Today the structured note
in src/app/clinic/consult/[visitId]/page.tsx is read-only for the doctor, there is
no draft state, and Mark Visit Done locks the AI output unedited. Fix all three.

1. NOTE LIFECYCLE. Add a note_status column to intake_sessions:
   'ai_draft' -> 'doctor_reviewed' -> 'signed'. New AI output always lands as
   'ai_draft'. Add signed_by (user id), signed_at, and a note_versions table
   (intake_session_id, version_no, structured_note_json, edited_by, edited_at,
   change_summary). Every save writes a new version; nothing is overwritten.

2. DOCTOR EDITING. In the consult note tab, make every field of the structured
   note editable by the doctor: chief complaint, HPI, severity, medications,
   allergies, past history. Field-level editing, not one giant textarea. Keep the
   patient's transcript (MIRROR toggle) untouched and read-only; the doctor edits
   the note, never the patient's words.

3. DRAFT LABELING. While note_status is 'ai_draft', show a clear persistent badge
   on the note: "AI DRAFT — not reviewed". Fields the AI flagged in
   confidence_flags_json get a visible marker and must be either edited or
   explicitly confirmed (a per-field confirm affordance) before signing.

4. SIGN STEP. Replace the current single Mark Visit Done action with two steps:
   a) "Review & Sign Note" — validates that all low-confidence fields are
      confirmed or edited, then sets note_status='signed', records signed_by and
      signed_at, writes the final version, and locks field editing.
   b) "Close Visit" — only enabled after signing. Keeps existing close behavior
      (status CLOSED, patient_summary rebuild, note lock).
   A visit cannot be closed with an unsigned note. Signing writes an audit_log
   entry with action 'NOTE_SIGNED'.

5. ADDENDA. After signing, edits are still possible but become dated addenda:
   stored as new note_versions rows with an is_addendum flag, rendered below the
   signed note with author and timestamp. The signed version is never mutated.
   The existing locked_at design already points this way; finish it.

6. EDIT CAPTURE FOR TRAINING. Persist the diff between the last AI version and
   the signed version into a note_edits table (intake_session_id, field, ai_value,
   doctor_value, created_at). No UI needed yet; this is the training-signal store
   that Sprint 2 builds on.

7. Update patient_summary rebuild to read from the SIGNED version, never the AI draft.

ACCEPTANCE:
- A doctor can edit any note field, sign, and close; the record shows who signed and when.
- Closing without signing is impossible.
- Editing after signing produces a visible addendum, not a silent change.
- note_versions contains the full trail; note_edits contains field-level diffs.
- The prescription flow and Rx tab are unaffected.

DO NOT: let the patient review screen write to a signed note, change the queue
flow, or remove the confidence dots / attention box / MIRROR toggle / ICD-10 chips.
```

## Prompt 1.5 — Signup routing, role onboarding, and doctor verification

Right now nothing stops a patient from ending up with a staff role, and there is no proof a doctor is a doctor. That is a security hole and a licensing liability, so it belongs in Sprint 1.

```
TASK: Fix the signup-to-first-use path. Verify what exists today, then close the
gaps: role-correct routing after auth, complete profile onboarding, doctor
identity verification, and a baseline patient demographic capture.

1. POST-AUTH ROUTING AUDIT. Trace every entry path (phone-OTP patient signup,
   staff login, Google/Apple social, mobile WebView bridge) and report where the
   user lands today. Then fix: a single post-auth router
   (src/lib/post-auth-redirect.ts) keyed on user.role and profile completeness.
   Patients land on the patient flow, doctors on clinic/queue, receptionists and
   admins on their surfaces. A user with an incomplete profile is routed to
   onboarding, not the product.

2. ROLE ONBOARDING.
   - Patient: name, DOB or age, sex, preferred language. Runs once after first
     OTP verification, before first check-in. Reused thereafter, never re-asked.
   - Doctor: name, medical registration number, issuing council (state council
     or NMC), specialty, and the signature display name used by the sign step
     from Prompt 1.4.
   - Receptionist/admin: name and clinic confirmation only.
   Track onboarding_completed_at on the profile rows.

3. DOCTOR VERIFICATION. A patient must never be able to become staff by signing up.
   - Default role for ALL self-signups is 'patient'. Remove any path where a
     self-signup can select or request a staff role, including direct calls to
     the profile/role endpoints (enforce server-side in auth-guard).
   - Staff roles are grant-only: a clinic admin invites by phone or email via an
     invitations table (token, role, clinic_id, invited_by, expires_at).
     Accepting a valid invite is the only way to acquire a staff role.
   - Add verification_status to doctor_profiles: 'pending' -> 'verified' |
     'rejected'. Until verified, a doctor can view the queue but cannot sign
     notes or issue prescriptions; enforce in auth-guard, not just UI.
     Verification is a manual admin action that records who verified, when, and
     the registry reference checked (registration number against the issuing
     council's public register). Structure the check behind src/lib/verification/
     so an automated NMC registry lookup can drop in later; do not build a
     scraper now.
   - The registration number and council render on every prescription and
     signed note.

4. BASIC PATIENT DETAILS. Check-in cannot complete without the minimum
   demographic set (name, age or DOB, sex). Missing fields are collected once at
   check-in and stored on the profile, not re-asked per visit.

ACCEPTANCE:
- A fresh self-signup can never yield a staff role, even via forged requests to
  role/profile endpoints; include the test that proves it.
- An invited doctor stays 'pending' until admin verification and cannot sign or
  prescribe while pending.
- Every auth path lands on the correct surface; incomplete profiles land on
  onboarding first.

DO NOT: block queue viewing for pending doctors (they observe, they cannot act),
break the mobile auth bridge, or add friction to returning-patient check-in.
```

---

# SPRINT 2 — Make the note trustworthy

## Prompt 2.1 — Real Indic ASR (Sarvam) with browser fallback

```
TASK: Replace browser Web Speech API as the primary speech capture with Sarvam's
Saaras Indic ASR. Browser ASR becomes the fallback, not the default. This is the
single highest-leverage upgrade to note quality in a noisy Indian OPD.

Current state: src/app/patient/intake/[visitId]/page.tsx uses the Web Speech API
with a BCP-47 locale map (hi-IN, bn-IN, te-IN, ...).

1. SERVER ROUTE. Create src/app/api/intake/transcribe/route.ts that accepts an
   audio blob (webm/opus or wav) plus language hint and visit ID, calls the Sarvam
   Saaras API (key from env SARVAM_API_KEY, never exposed client-side), and
   returns { transcript, language_detected, confidence }. Auth: the route requires
   a valid patient session bound to that visit. Apply the Sprint 1 rate limiter.

2. CLIENT CAPTURE. In the intake page, switch primary capture to MediaRecorder:
   record the answer, upload to the transcribe route, render the transcript for
   the patient to confirm or re-record. Chunk long answers (cap ~60s per answer).
   Show a clear recording indicator and a processing state.

3. FALLBACK CHAIN. If the Sarvam call fails or times out (8s budget), fall back
   to the existing Web Speech path automatically and tag the answer with
   asr_source: 'browser'. Every transcript stores asr_source and confidence in
   intake_sessions.audio_refs_json so note quality can be compared by source later.

4. TYPED INPUT stays as the always-available third option, unchanged.

5. CONSENT AND DPDP. Sending audio to Sarvam is third-party processing. Add
   Sarvam to the consent text shown at patient/consent/[clinicId], and record the
   ASR vendor used per session. If consent for third-party processing is not
   granted, use browser ASR or typed input only.

6. Store audio references, not raw audio, unless an AUDIO_RETENTION env flag is
   on; default is transcribe-and-discard.

ACCEPTANCE:
- On a supported browser, an answer spoken in Hindi goes through Sarvam and the
  transcript quality metadata is stored.
- Killing the Sarvam key mid-flow degrades to browser ASR without breaking intake.
- No Sarvam key or raw audio ever reaches the client bundle.

DO NOT: change the seven-question script structure in this prompt (that is a
separate task), or break the translate-questions flow.
```

## Prompt 2.2 — AI output validation, grounding, and the learning loop

```
TASK: Stop trusting AI output as-is. Today the structured note from
src/app/api/intake/structure/route.ts is written to the database unvalidated: no
schema check, no retry on malformed output, no check that claims trace back to
the transcript. In a clinical note a hallucinated medication is a safety event.

1. STRICT SCHEMA. Define a zod schema for the structured note (chief_complaint,
   hpi, duration, severity, associated_symptoms, medications[], allergies[],
   past_history, icd10_hints[], confidence_flags, screen_flags) in
   src/lib/validation/structured-note.ts. Every AI response is parsed against it.
   Unknown keys rejected, enums enforced (severity scale, flag values).

2. RETRY THEN DEGRADE. On parse failure: one retry with the validation errors
   appended to the prompt ("your previous output failed validation: ...").
   On second failure, fall through the existing chain (Claude proxy, then local
   deterministic structuring) and record which tier produced the accepted note
   in intake_sessions (add a structuring_source column).

3. GROUNDING CHECK. After a note validates, run a grounding pass: every
   medication, allergy, and named symptom in the note must appear in (or be a
   direct translation/normalization of) the transcript. Implement as a second,
   cheap LLM call that returns per-entity grounded: true/false, with a
   deterministic substring pre-check to skip obvious matches. Ungrounded entities
   are NOT deleted; they get added to confidence_flags so the doctor-review flow
   from Sprint 1 forces explicit confirmation before signing.

4. TIMEOUT AND ERROR STATES. Give the structuring call an explicit 25s budget.
   If it times out, the visit is marked structuring_status='failed' and the doctor
   console shows a real error state on that visit ("Note generation failed —
   view raw transcript") instead of a stale or empty note. The raw transcript is
   always viewable. Add a retry button for staff.

5. LEARNING LOOP. The note_edits table from Sprint 1 already captures doctor
   diffs. Add a nightly-safe aggregation view or query (no cron needed yet) that
   computes: edit rate per field, per language, per asr_source, per
   structuring_source. Expose it at /api/analytics as note-quality metrics for
   the clinic admin dashboard. This is the drift monitor.

6. HARDEN THE LOCAL FALLBACK. The deterministic local structuring currently
   depends on exact question order and breaks silently if the script changes.
   Key it by stable question IDs instead of array position, and make it throw
   loudly (caught, logged, surfaced) when it cannot map an answer.

ACCEPTANCE:
- Malformed AI output never reaches the database; the retry-then-degrade chain works.
- A note containing a medication absent from the transcript arrives at the doctor
  flagged, and cannot be signed without explicit confirmation of that field.
- A structuring timeout produces a visible error state and a retry path, never a
  silent empty note.
- The analytics endpoint returns edit-rate metrics.

DO NOT: raise the model temperature, let the AI add diagnosis or treatment
fields, or auto-delete ungrounded entities.
```

## Prompt 2.3 — Vitals capture

```
TASK: Add a vitals step so every note carries objective numbers. Today no vitals
exist anywhere in the schema or the flow.

1. SCHEMA. Add a vitals table: id, visit_id, patient_id, recorded_by (user id,
   nullable for patient self-report), recorded_at, systolic_bp, diastolic_bp,
   heart_rate, temperature_c, resp_rate, spo2, weight_kg, height_cm, glucose_mgdl,
   entry_source ('staff' | 'patient_self_report'). All measurements nullable;
   capture what is available. Add sane range constraints (reject spo2 > 100,
   temperature outside 30–45, etc.) both in zod and as DB checks.

2. STAFF ENTRY. In the doctor console queue or consult view, add a lightweight
   vitals entry panel: a receptionist or doctor can enter vitals for any
   CHECKED_IN or later visit in under 30 seconds. Numeric keypads, metric units,
   no required fields.

3. PATIENT SELF-REPORT. At the end of intake, an optional step: "Do you know your
   weight? Recent BP?" Self-reported values are stored with
   entry_source='patient_self_report' and rendered in the doctor console with a
   distinct "self-reported" tag, never mixed silently with staff-measured values.

4. DISPLAY. Vitals render at the top of the consult note tab in a compact strip.
   Out-of-range values get the same attention treatment as screen_flags (feed the
   FOR YOUR ATTENTION box when clearly abnormal: spo2 < 92, systolic > 180, etc.,
   with thresholds in one editable constants file flagged for clinical review).

5. Vitals from the visit are included in the patient_summary rebuild and in the
   patient history timeline at clinic/history/[patientId].

ACCEPTANCE:
- Staff can record vitals pre-consult; the doctor sees them in the note view.
- Abnormal values surface in the attention box.
- Self-reported and measured values are visually distinct.
- API validates ranges; audit_log records vitals writes.

DO NOT: make any vitals field mandatory (walk-in clinics often lack equipment),
or let vitals entry block the queue flow.
```

## Prompt 2.4 — Kill the silent failures

```
TASK: The happy path works; the edges fail silently. In a clinical product a
doctor can act on incomplete data without knowing it. Fix the failure handling.

1. CONSENT WRITES ARE NON-BLOCKING AND SILENT. Make consent recording at
   src/app/api/consent/route.ts a blocking step in the patient flow: intake does
   not start until the consent write is confirmed. On failure, show a retry UI.
   A visit must never reach the doctor with intake data but no consent record.

2. FOLLOW-UP GENERATION fails silently with no retry. Add one automatic retry
   with backoff; on final failure, proceed without a follow-up question but log
   it (structuring metadata) so the analytics can count how often follow-ups fail.

3. INPUT VALIDATION. Empty or whitespace-only intake answers are currently
   accepted and passed downstream. Reject them at the API (zod, min length after
   trim) and in the UI prompt the patient to answer or explicitly skip
   ("Prefer not to say"), so a skip is a recorded choice, not missing data.

4. MID-INTAKE PERSISTENCE. If the patient closes the tab mid-intake, in-progress
   answers are lost. Persist each answer to the server as it is confirmed
   (per-answer POST, already mostly in place via /api/intake) and on reload of
   patient/intake/[visitId], resume from the first unanswered question. Verify
   the resume path actually works end to end.

5. GLOBAL PATTERN. Sweep all patient-flow and consult-flow fetch calls: every
   mutation must surface failure to the user (toast or inline) and either retry
   or leave the user on a screen where retry is possible. No fire-and-forget
   writes anywhere in the clinical path. List every call site you changed.

ACCEPTANCE:
- Killing the network mid-intake, then reloading, resumes without data loss.
- A consent write failure visibly blocks and retries; it cannot be skipped.
- Empty answers are impossible to submit; skips are recorded explicitly.

DO NOT: add a service worker or offline queue in this prompt (that is Sprint 3),
and do not change the 5-second queue polling.
```

## Prompt 2.5 — Ambient consult scribe: record, summarize, purge

The consult-room conversation carries what intake never gets: the working diagnosis as the doctor states it, the plan, the context. Capture it, summarize it into the EMR, and destroy the recording. Depends on Prompt 2.1 (Sarvam) and the sign flow from Prompt 1.4.

```
TASK: Build an ambient consult scribe. When the doctor opens a patient's consult
view, audio recording of the consult conversation starts (with consent),
transcribes and summarizes into the note, and on visit close the audio and raw
transcript are hard-deleted. Only the doctor-signed EMR summary survives.

1. CONSENT FIRST, ALWAYS. Recording requires BOTH: a patient consent scope
   'consult_recording' captured at check-in (new scope in the consent table,
   named explicitly in the consent text), and the doctor's standing opt-in in
   their profile settings. Missing either, the consult view behaves exactly as
   today and no capture code runs.

2. START AND CONTROL. When the doctor opens clinic/consult/[visitId] and both
   consents hold, start MediaRecorder capture with a persistent, unmissable
   on-screen indicator ("Recording consult") and one-tap pause and stop controls
   for the doctor. The patient-facing consent text tells them recording happens
   during the consult and is deleted after.

3. TRANSCRIBE. Upload chunks (60–90 seconds) to a new
   /api/consult/transcribe route using the Sarvam path from Prompt 2.1 with
   language hint 'auto' (clinic speech is code-mixed Hindi/English). Store
   chunk refs and the rolling transcript in a new consult_recordings table
   (visit_id, status, transcript, chunk_refs_json, created_at), never in
   intake_sessions. Apply the Sprint 1 rate limiter.

4. SUMMARIZE INTO THE NOTE. On demand ("Summarize consult" button) and
   automatically when the doctor enters the Review & Sign step, run the
   transcript through a dedicated structuring prompt that extracts: condition
   and situation discussed, findings mentioned, diagnosis AS STATED BY THE
   DOCTOR (the prompt must forbid inferring a diagnosis not said aloud), plan
   and instructions, follow-up. Validate against a zod schema and ground-check
   against the transcript (Prompt 2.2 pattern). The result lands as a
   'consult_summary' section on the note, labeled AI DRAFT, editable field by
   field, and it goes through the same sign flow as the rest of the note. It
   never auto-commits.

5. PURGE ON CLOSE. When the visit closes: hard-delete all audio chunks and the
   raw transcript, keep only the signed summary inside the note. Write an
   audit_log entry 'CONSULT_RECORDING_PURGED' with chunk and byte counts so
   deletion is provable. Add a safety-net sweep to the maintenance endpoint
   (Prompt 3.4): purge any consult_recordings older than 24 hours regardless
   of state. An unsigned summary dies with the recording.

6. PRIVACY OF PROCESSING. Until the Prompt 3.6 deidentification layer exists,
   consult transcripts route through the platform proxy tier only, never
   directly to OpenRouter, and no identity fields accompany the transcript.

7. FAILURE MODES. Mic permission denied, transcription failure, doctor pauses,
   or the tab reloads: the consult proceeds normally, nothing blocks, and the
   sign flow simply has no consult section. Recording state must survive a
   consult-page reload within the same visit.

ACCEPTANCE:
- No capture without both consents; the indicator is visible for the entire
  recording.
- After visit close, no audio or raw transcript exists in DB or storage
  (verify with a query), and the purge is in the audit log.
- The doctor edits and signs the summary like any other note section; the
  diagnosis field only ever contains what the doctor said.
- Denying the mic breaks nothing.

DO NOT: record outside an open consult, retain raw transcripts past close,
send identified transcripts to third parties, or let the summary bypass the
sign flow from Prompt 1.4.
```

---

# SPRINT 3 — Make the record an asset

## Prompt 3.1 — Promote the note into typed, FHIR-aligned clinical resources

```
TASK: The record is strong on narrative, weak on structured queryable data.
Promote the structured note from an unvalidated JSON blob into typed, coded,
versioned clinical resources. Field names align to FHIR from day one; full FHIR
serialization can come later, the shape is what matters now.

New tables (additive; structured_note_json stays as the narrative source):

1. conditions (FHIR Condition): id, patient_id, visit_id, code_icd10,
   display_text, clinical_status ('active' | 'resolved' | 'inactive'),
   onset_date (nullable), recorded_by, recorded_at, verified_by_doctor boolean.
   Populated when the doctor signs a note: ICD-10 hints the doctor confirms
   become coded conditions; unconfirmed hints stay hints.

2. observations (FHIR Observation): generalize the Sprint 2 vitals table or add
   alongside it: code (LOINC where known, else local code), value_quantity,
   unit, effective_at, source. Lab values parsed from documents land here too.

3. medication_statements (FHIR MedicationStatement): id, patient_id, visit_id,
   drug_name, rxnorm_code (nullable, best-effort match), dose, frequency,
   status ('active' | 'stopped'), source ('intake' | 'prescription').
   Prescriptions written in the Rx tab create entries; intake-reported meds
   create entries flagged as patient-reported.

4. allergy_intolerances (FHIR AllergyIntolerance): id, patient_id, substance,
   reaction (nullable), severity ('mild' | 'moderate' | 'severe' | 'unknown'),
   recorded_at, verified_by_doctor. Update the intake script's allergy question
   to ask reaction type when an allergy is reported (one follow-up).

5. Rework patient_summary to be a materialized rollup OF these tables rather
   than parallel JSON: problems from conditions, meds from medication_statements
   reconciled across visits (same drug across visits collapses, conflicting
   status surfaces for doctor review), allergies from allergy_intolerances.
   Keep the JSON output shape the frontend already consumes to avoid UI rework.

6. Sign-time population: signing a note (Sprint 1 flow) is the moment narrative
   becomes coded data. Add a light confirmation panel to the sign step: proposed
   conditions/meds/allergies extracted from the signed note, doctor ticks to
   commit. Nothing enters the coded record without the doctor's confirmation.

7. Write a backfill script for existing closed visits: best-effort extraction
   into the new tables, everything marked verified_by_doctor=false.

ACCEPTANCE:
- Signing a note with confirmed ICD-10 hints creates coded condition rows.
- patient_summary is rebuilt from the coded tables and the UI renders unchanged.
- A SQL query can answer "all active hypertension patients at this clinic" —
  include that query in the PR description as proof.

DO NOT: introduce a full FHIR server or change the doctor console layout beyond
the sign-step confirmation panel.
```

## Prompt 3.2 — Adaptive intake by body system

```
TASK: Turn the fixed seven-question script into a symptom-driven intake. Fever
should branch differently from chest pain. The goal is a real HPI: onset,
aggravating/relieving factors, radiation, timing — asked only when relevant.

1. Define the script as data, not code: src/data/intake-scripts/ containing a
   base script (current seven questions, keyed by stable question IDs per Sprint
   2.2's fallback fix) plus branch modules per body system (fever, respiratory,
   chest pain, abdominal, musculoskeletal, skin, headache/neuro).

2. After the chief complaint answer, classify it into zero or one body system
   (LLM call with a fixed enum output, validated; on failure, no branch, base
   script only). The branch inserts 2–4 targeted questions. Total question count
   caps at 12 so intake stays under ~6 minutes.

3. Every branch question maps to a named HPI field (onset, radiation,
   aggravating_factors, relieving_factors, timing_pattern) so the structured
   note schema from Sprint 2.2 gains those optional fields.

4. Red-flag short-circuit: each branch module declares red-flag answers
   (e.g., chest pain + radiation to arm + sweating) that immediately add a
   screen_flag. Thresholds live in the same clinical constants file as the
   vitals thresholds, flagged for physician review.

5. Add review-of-systems, family history, and social history (smoking, alcohol,
   occupation) as an optional tail section the clinic can toggle on per-clinic
   (clinics table setting). Default off to protect intake time.

6. Translations: branch questions flow through the existing
   translate-questions path; cache translations per language to avoid
   re-translating static questions every session.

ACCEPTANCE:
- "Bukhar hai" (fever) triggers the fever branch; a sprained ankle does not get
  fever questions.
- The local deterministic fallback still structures a branched session correctly
  (question-ID keyed).
- A branch-classification failure degrades to the base script, never blocks intake.

DO NOT: exceed 12 questions, let the classifier output free text, or make the
tail section default-on.
```

## Prompt 3.3 — India rails: ABDM path, family accounts, offline resilience

```
TASK: Close the second layer of India-market execution: ABDM beyond capture-only,
a family-account model, and low-bandwidth resilience.

1. ABHA VERIFICATION. ABHA is currently stored but never verified. Integrate the
   ABDM sandbox: verify an ABHA number/address at capture time via the ABDM
   Healthcare Professional/HIP sandbox APIs (env-gated: ABDM_ENV=sandbox).
   Store verification status and timestamp on patient_profiles. Build the
   integration behind an interface (src/lib/abdm/) so production credentials
   drop in later. Do NOT build full HIP data-exchange yet; verification plus a
   documented linkage design (write it to docs/abdm-path.md) is the scope.

2. FAMILY ACCOUNTS. One phone number commonly serves a household. Model it:
   a phone number maps to one account with multiple patient_profiles
   (add relationship: 'self' | 'spouse' | 'child' | 'parent' | 'other', and
   managed_by pointing at the primary profile). Check-in flow: after OTP, if
   multiple profiles exist, "Who is this visit for?" with an "Add family member"
   option (name, DOB/age, sex). Each family member gets their own UHID, summary,
   and consent trail. Consent is per-patient: a parent consents for a minor,
   recorded as such.

3. OFFLINE/LOW-BANDWIDTH. Re-enable the PWA service worker (currently disabled).
   Scope: cache the app shell and intake static assets; queue intake answer
   POSTs when offline and replay on reconnect (background sync where supported,
   in-memory + localStorage queue fallback). The doctor console stays
   online-only. Show a clear offline banner in the patient flow.

4. PRESCRIPTION REALITIES. Add a generic-name line under each branded drug on
   the printed/shared prescription (formulary data at src/data/formulary
   already exists; extend entries with generic names where missing).

ACCEPTANCE:
- Sandbox ABHA verification works and status renders on the patient profile.
- One phone can check in two family members as distinct patients with distinct
  histories; merge-patients respects the family structure.
- Intake completes on a throttled 2G-simulated connection with answer queueing.

DO NOT: attempt production ABDM registration, store Aadhaar numbers, or make
family linking mandatory.
```

## Prompt 3.4 — Operations layer: monitoring, retention, backups, cost controls

```
TASK: Build the unglamorous load-bearing layer. None of this exists today.

1. ERROR TRACKING. Add Sentry (or an env-gated equivalent) to apps/web, server
   and client, with PII scrubbing configured: no transcripts, no phone numbers,
   no note content in events. Tag events with route and clinic_id only.

2. STRUCTURED LOGGING. Replace ad-hoc console.log in API routes with a small
   logger (src/lib/logger.ts) emitting JSON lines: level, route, visit_id,
   duration_ms, outcome. Log every AI call with model, tier, latency, token
   counts, and estimated cost.

3. AI COST CONTROLS. A daily spend counter per clinic (extend the Sprint 1
   rate_limit_counters pattern): when a clinic crosses a configurable daily AI
   budget (env default), structuring degrades to the local deterministic tier
   and the clinic admin sees a banner. Never block intake entirely on budget.

4. RETENTION POLICY. The audit log grows forever. Implement: audit_log rows
   older than a configurable window (default 3 years, aligned to Indian medical
   record norms; make it a documented constant) move to a cold audit_log_archive
   table via a maintenance endpoint (POST /api/admin/maintenance, super-admin
   only, idempotent). Consent withdrawal currently hard-deletes intake: change
   to soft-delete with a 30-day recovery window (deleted_at column, excluded
   from all reads), then hard purge via the same maintenance endpoint.

5. BACKUPS. Neon provides PITR; add docs/operations.md documenting: backup and
   restore procedure, secrets rotation runbook, the incident-response path for
   "a note is wrong in a real consult" (who is notified, how the addendum flow
   is used, what gets audit-logged), and the deploy checklist including the
   env assertions from Sprint 1.

6. HEALTH CHECK. /api/health returning DB connectivity, AI provider
   reachability, and pending-migration status, for uptime monitoring.

ACCEPTANCE:
- A thrown error in an API route appears in the tracker without PII.
- The AI cost log can answer "what did clinic X spend on structuring yesterday".
- Consent withdrawal is recoverable for 30 days, then purged.
- docs/operations.md exists and is accurate to the code.

DO NOT: send any PHI to the error tracker, or auto-run destructive maintenance
on a schedule (manual trigger only for now).
```

## Prompt 3.5 — UI polish and pilot instrumentation

```
TASK: Two small workstreams: finish the UI polish the audit flagged, and
instrument the product for a two-clinic pilot.

UI POLISH:
1. Responsive consult view: src/app/clinic/consult/[visitId]/page.tsx is tuned
   for one width. Add breakpoints for ~768px (tablet, the realistic clinic
   device) and ~1440px. The note/rx/docs tabs must work on a tablet in portrait.
2. Move hard-coded hex values across both design systems (patient warm/paper,
   doctor dark slate/cyan) into CSS variables in the global stylesheet. No
   visual change intended; diff screenshots to confirm.
3. Audit the patient flow at 360px width and on a simulated low-end device
   (CPU 4x throttle): fix any layout break or interaction jank found. List findings.

PILOT INSTRUMENTATION:
4. Define the pilot metrics and compute them server-side in /api/analytics:
   - Note quality: doctor edit rate per field (from note_edits), % notes signed
     without edits, ungrounded-entity rate.
   - Retention: % patients with a second visit within 90 days; % consenting to
     cross-clinic history.
   - Ops: intake completion rate, median intake duration, ASR source mix,
     structuring tier mix, AI cost per visit.
5. Render these on the existing clinic/analytics dashboard as a simple weekly
   view. No new charting library; whatever the page already uses.
6. Add a lightweight event log (analytics_events table: event, visit_id,
   clinic_id, metadata_json, created_at) capturing: intake_started,
   intake_completed, intake_abandoned (with last question reached), note_signed,
   rx_shared. No third-party analytics; this data stays in Postgres.

ACCEPTANCE:
- Consult view usable on a 768px tablet.
- Analytics dashboard shows the pilot metrics with real data from seeded visits.
- Zero visual regression from the CSS variable migration.

DO NOT: add external analytics SDKs, redesign either design system, or touch
the four hard requirements (attention box, confidence dots, MIRROR, ICD-10 chips).
```

## Prompt 3.6 — PII segregation: identity vault, deidentified processing, patient-held record

One design note before the prompt. "Protected patient information lives only on the patient's device" cannot hold in full for this product: a longitudinal, cross-clinic EMR requires the doctor to pull up a returning patient by phone number, which means the server must be able to resolve identity. The practical ceiling, and what this prompt builds, is: identity sealed in an encrypted vault, clinical data keyed only by pseudonymous UHID, nothing identified ever leaving the platform, re-identification only for authorized staff and always audit-logged, and the patient holding their own fully identified copy.

```
TASK: Separate identity from clinical data. Third parties never learn who the
patient is, staff re-identification is scoped and logged, and the patient gets
their own identified copy of the record.

1. IDENTITY VAULT. Move identity fields (name, phone, DOB, sex, ABHA, address)
   out of user/patient_profiles into a patient_identity table encrypted at the
   application layer: AES-256-GCM, envelope encryption with the data key
   wrapped by a master key from managed secrets, so keys can rotate without
   re-encrypting everything. Phone lookup for check-in works via a keyed hash
   (HMAC) index column, never plaintext phone.

2. PSEUDONYMOUS CLINICAL DATA. All clinical tables (visits, intake_sessions,
   conditions, observations, medication_statements, prescriptions, vitals,
   consult_recordings) reference the patient by patient_id/UHID only. Sweep
   every JSON blob (structured_note_json, rx header payloads, share payloads,
   analytics_events metadata) for embedded names or phones and scrub the write
   paths that put them there.

3. DEIDENTIFIED AI PROCESSING. No name, phone, DOB, ABHA, or address ever
   reaches OpenRouter or Sarvam. Build src/lib/deidentify.ts: deterministic
   redaction of that patient's known identity values from any outbound text,
   plus a regex layer for phone and ABHA number patterns, replacing with
   stable placeholders ([PATIENT], [PHONE]). Apply it in front of every
   third-party call including the consult scribe (Prompt 2.5). Tag each AI
   call log (Prompt 3.4) with deidentified: true. Placeholders are restored to
   display values only at doctor-facing render time.

4. SCOPED RE-IDENTIFICATION. Decrypting identity happens per request, only for
   staff sessions that pass the clinic-scoping checks from Prompt 1.3, and
   every decryption writes an audit_log entry 'IDENTITY_ACCESS' with actor and
   patient. Error tracking, logs, and analytics see UHIDs only, never identity.

5. PATIENT-HELD RECORD. On the patient's own authenticated device the record
   renders fully identified, and a "Download my record" action exports the
   complete identified record (JSON and a printable PDF). This is the
   patient-owned copy; the server keeps identity sealed in the vault.

6. MIGRATION. Backfill existing rows into the vault with a reversible,
   staging-tested migration. Document the architecture and its stated limits
   in docs/privacy-architecture.md, including why identity cannot be
   device-only for a cross-clinic EMR.

ACCEPTANCE:
- A dump of any clinical table yields no name, phone, or ABHA.
- Captured outbound payloads to OpenRouter and Sarvam contain no identity
  values; include the interception test.
- Check-in by phone still works, via the HMAC index.
- Every staff view of an identified record appears in audit_log.
- The patient can export their full identified record.

DO NOT: degrade the doctor's UX (names render normally for authorized staff),
weaken the check-in flow, or ship the migration without a staging rehearsal.
```

---

## Not in these prompts (deliberately)

Two audit items need humans, not Antigravity: a practising physician reviewing the red-flag logic and clinical thresholds (the constants files in Prompts 2.3 and 3.2 are structured to make that review easy), and the DPDP legal pass (data processing agreements with Sarvam and OpenRouter, terms of service, retention policy sign-off). Line both up while the sprints run; Sprint 3 assumes the legal answers exist.

## Sequencing notes

Prompts 1.1 through 1.3 can run as one Antigravity session each, in order. Prompt 1.4 is the largest single task; give it its own session and review the note lifecycle carefully before merging. Prompt 1.5 can run in parallel with 1.4 since they touch different surfaces, but the sign step in 1.4 must land before 1.5's "pending doctors cannot sign" enforcement is testable. In Sprint 2, run 2.4 before or alongside 2.1, since both touch the intake page. Prompt 2.5 (consult scribe) needs 2.1 and 1.4 merged first. Sprint 3 prompts are independent of each other except 3.1, which depends on 1.4's sign flow. Prompt 3.6 can be pulled forward any time after 1.3 if you want deidentified AI processing earlier; the consult scribe gets safer the sooner it lands.

After each prompt, ask Antigravity to summarize what changed and run the acceptance checks before you move on. If it claims something passes, make it show the evidence.
