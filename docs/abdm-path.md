# ABDM (Ayushman Bharat Digital Mission) — integration path

## Scope now (3.3)

- **Verification only.** `src/lib/abdm/verifyAbha()` verifies an ABHA
  number/address against the ABDM sandbox when `ABDM_ENV` + `ABDM_CLIENT_ID` /
  `ABDM_CLIENT_SECRET` are set. Result is stored on `patient_profiles`
  (`abha_verified`, `abha_verified_at`). Until configured, ABHA is captured but
  left **unverified** — no behaviour depends on verification yet.
- We do **not** build full HIP/HIU data-exchange here.

## Environment

```
ABDM_ENV=sandbox                      # or 'production'
ABDM_BASE_URL=https://healthidsbx.abdm.gov.in/api
ABDM_CLIENT_ID=...                    # from ABDM sandbox onboarding
ABDM_CLIENT_SECRET=...
```

## Sandbox verification flow (implemented in verifyAbha)

1. `POST {ABDM_BASE}/v0.5/sessions` with `clientId`/`clientSecret` → `accessToken`.
2. `POST {ABDM_BASE}/v1/search/searchByHealthId` with `{ healthId }` + bearer token
   → 200 means the ABHA resolves to a real account.

## Future: HIP linkage design (not built)

To become a Health Information Provider (share records into ABDM):

1. **Care-context linkage** — after a visit, link a care-context (the visit) to
   the patient's ABHA via the ABDM gateway (`/v0.5/links/link/init` →
   confirm with OTP).
2. **Consent-driven data push** — respond to HIU consent requests by returning a
   FHIR bundle for the linked care-contexts. The 3.1 coded resources
   (Condition / Observation / MedicationStatement / AllergyIntolerance) are the
   FHIR-shaped source for this bundle; only serialization + the gateway callback
   handlers remain.
3. **Certification** — production access requires ABDM milestone certification
   (M1–M3) and a registered HIP ID.

## Sequencing

Verification (done) is safe to ship. Care-context linkage + data push require
production ABDM credentials + certification and should follow the DPDP legal
sign-off (data-processing terms with ABDM).
