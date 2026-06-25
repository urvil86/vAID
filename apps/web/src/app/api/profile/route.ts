import sql from '@/app/api/utils/sql';
import { requireUser } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';

// GET /api/profile — the signed-in user's own patient profile (ABHA, dob, sex).
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const [row] = await sql`
    SELECT user_id, date_of_birth, sex, abha_id
    FROM patient_profiles
    WHERE user_id = ${ctx.userId}
  `;
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
