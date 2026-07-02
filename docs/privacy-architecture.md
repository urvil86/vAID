# V-Aid — Privacy architecture (PII segregation)

## Stated limit (important)

"Protected patient information lives only on the patient's device" **cannot fully
hold** for this product: a longitudinal, cross-clinic EMR requires the server to
resolve a returning patient (by phone/ABHA), so the server must be able to know
identity. The practical ceiling — and the target architecture — is:

- identity **sealed in an encrypted vault**,
- clinical data keyed only by **pseudonymous UHID**,
- **nothing identified** ever leaving the platform (third-party AI/ASR),
- re-identification **scoped to authorised staff and always audit-logged**,
- the **patient holds their own fully identified copy**.

## Shipped now (3.6)

- **De-identified AI processing (`src/lib/deidentify.ts`).** Before ANY
  third-party call (OpenRouter structuring/follow-up/classify), the patient's
  known identity values (name/phone/ABHA) plus phone/ABHA number patterns are
  replaced with stable placeholders (`[PATIENT]`/`[PHONE]`/`[ABHA]`). The
  deterministic **local** structuring tier and the grounding check use the raw
  in-house transcript. Placeholders are restored only at doctor-facing render.
- **Patient-held record (`GET /api/my-record`).** On the patient's own device
  the record is fully identified; the endpoint exports the complete identified
  record (JSON) as the patient-owned copy. Every access is audit-logged.

## Remaining (structural — needs its own migration pass)

The **identity vault** (`patient_identity`, AES-256-GCM envelope encryption, an
HMAC phone-lookup index) and moving all clinical tables to reference the patient
by UHID only is a re-architecture of identity. It must:

1. move name/phone/DOB/sex/ABHA/address out of `user`/`patient_profiles` into
   `patient_identity`, encrypted with a data key wrapped by a managed master key
   (rotatable without re-encrypting everything);
2. resolve check-in by a keyed **HMAC** of the phone (never plaintext);
3. gate every decryption behind the clinic-scoping checks and log an
   `IDENTITY_ACCESS` audit row;
4. scrub any name/phone embedded in JSON blobs (structured_note_json, rx header,
   share payloads, analytics metadata).

Per the guidance, this migration **must be rehearsed on staging** and is
reversible; it is deliberately staged after the deidentification + patient-held
record controls, which already prevent identified data from leaving the platform.
