import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { ensurePatientUhid } from '@/lib/patient';

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
      SELECT user_id, date_of_birth, sex, abha_id, uhid
      FROM patient_profiles WHERE user_id = ${target}
    `;
  } catch {
    // uhid column not migrated yet — fall back so reads never 500.
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
  const abha = typeof body.abhaId === 'string' ? body.abhaId.trim() : null;
  const dob = body.dateOfBirth || null;
  const sex = body.sex || null;

  const [row] = await sql`
    INSERT INTO patient_profiles (user_id, abha_id, date_of_birth, sex)
    VALUES (${ctx.userId}, ${abha}, ${dob}, ${sex})
    ON CONFLICT (user_id) DO UPDATE SET
      abha_id       = COALESCE(${abha}, patient_profiles.abha_id),
      date_of_birth = COALESCE(${dob}, patient_profiles.date_of_birth),
      sex           = COALESCE(${sex}, patient_profiles.sex)
    RETURNING user_id, date_of_birth, sex, abha_id
  `;
  await audit(request, ctx, 'update', 'patient_profile', ctx.userId);
  return Response.json({ profile: row });
}
