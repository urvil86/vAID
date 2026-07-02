import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { ensurePatientUhid } from '@/lib/patient';
import { verifyAbha } from '@/lib/abdm';

// GET /api/profile            — the signed-in user's own profile (ABHA, UHID…)
// GET /api/profile?userId=XXX — a patient's profile, for clinic staff only.
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const target = searchParams.get('userId') || ctx.userId;
  if (target !== ctx.userId && !isStaff(ctx.role) && !ctx.isDevBypass) return forbidden();

  // Minting the V-Aid ID is idempotent — safe to ensure on every read.
  await ensurePatientUhid(target);

  let row;
  try {
    [row] = await sql`
      SELECT pp.user_id, pp.date_of_birth, pp.sex, pp.abha_id, pp.uhid,
             pp.preferred_language, u.name
      FROM patient_profiles pp JOIN "user" u ON u.id = pp.user_id
      WHERE pp.user_id = ${target}
    `;
  } catch {
    // newer columns not migrated yet — fall back so reads never 500.
    [row] = await sql`
      SELECT user_id, date_of_birth, sex, abha_id
      FROM patient_profiles WHERE user_id = ${target}
    `;
  }
  return Response.json({ profile: row ?? null });
}

// PUT /api/profile — the user updates their own ABHA id (and optional dob/sex).
// ABHA is captured for later ABDM mapping; it is NOT verified against ABDM here.
export async function PUT(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const body = await request.json();
  // Empty ABHA stores as NULL so the cross-clinic unique index ignores it.
  const abha = (typeof body.abhaId === 'string' ? body.abhaId.trim() : '') || null;
  const dob = body.dateOfBirth || null;
  const sex = body.sex || null;
  const lang = typeof body.preferredLanguage === 'string' && body.preferredLanguage.trim()
    ? body.preferredLanguage.trim()
    : null;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;

  try {
    // Name lives on the auth user; update it when provided.
    if (name) {
      await sql`UPDATE "user" SET name = ${name} WHERE id = ${ctx.userId}`;
    }
    const [row] = await sql`
      INSERT INTO patient_profiles (user_id, abha_id, date_of_birth, sex, preferred_language)
      VALUES (${ctx.userId}, ${abha}, ${dob}, ${sex}, ${lang})
      ON CONFLICT (user_id) DO UPDATE SET
        abha_id            = COALESCE(${abha}, patient_profiles.abha_id),
        date_of_birth      = COALESCE(${dob}, patient_profiles.date_of_birth),
        sex                = COALESCE(${sex}, patient_profiles.sex),
        preferred_language = COALESCE(${lang}, patient_profiles.preferred_language)
      RETURNING user_id, date_of_birth, sex, abha_id, preferred_language
    `;
    await audit(request, ctx, 'update', 'patient_profile', ctx.userId);

    // ABDM verification at capture time (no-op / unverified until ABDM is wired).
    let abhaVerified = false;
    if (abha) {
      const { verified } = await verifyAbha(abha);
      abhaVerified = verified;
      await sql`
        UPDATE patient_profiles
        SET abha_verified = ${verified}, abha_verified_at = ${verified ? new Date() : null}
        WHERE user_id = ${ctx.userId}
      `;
    }
    return Response.json({ profile: { ...row, abha_verified: abhaVerified } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/unique|duplicate/i.test(msg)) {
      return Response.json(
        { error: 'This ABHA is already linked to another account.' },
        { status: 409 }
      );
    }
    console.error('Error saving profile:', e);
    return Response.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
