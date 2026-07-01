import { randomUUID } from 'node:crypto';
import sql from '@/app/api/utils/sql';
import { requireUser } from '@/lib/auth-guard';
import { ensurePatientUhid } from '@/lib/patient';
import { checkOrigin } from '@/lib/csrf';

const RELATIONSHIPS = ['spouse', 'child', 'parent', 'other'];

/**
 * Family accounts (3.3): one phone/account can manage several patient profiles.
 * A family member is a managed profile (its own UHID, summary, consent trail);
 * consent is always per-patient. At check-in the account picks who the visit is
 * for (that client wire-in is the remaining piece).
 *
 * GET  /api/family — the account holder + everyone they manage.
 * POST /api/family { name, dateOfBirth?, sex?, relationship } — add a member.
 */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const members = await sql`
    SELECT pp.user_id, u.name, pp.relationship, pp.uhid, pp.date_of_birth, pp.sex,
           (pp.user_id = ${ctx.userId}) AS is_self
    FROM patient_profiles pp
    JOIN "user" u ON u.id = pp.user_id
    WHERE pp.user_id = ${ctx.userId} OR pp.managed_by = ${ctx.userId}
    ORDER BY (pp.user_id = ${ctx.userId}) DESC, u.name
  `;
  return Response.json({ members });
}

export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { name, dateOfBirth, sex, relationship } = await request.json();
  if (!name || !String(name).trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  const rel = RELATIONSHIPS.includes(relationship) ? relationship : 'other';

  // A managed member is a shell user (no login) linked to the account holder.
  const id = randomUUID();
  const email = `family-${id}@managed.vaid.local`;
  await sql`INSERT INTO "user" (id, name, email) VALUES (${id}, ${String(name).trim()}, ${email})`;
  await sql`
    INSERT INTO patient_profiles (user_id, date_of_birth, sex, relationship, managed_by)
    VALUES (${id}, ${dateOfBirth || null}, ${sex || null}, ${rel}, ${ctx.userId})
  `;
  const uhid = await ensurePatientUhid(id);

  return Response.json({ member: { user_id: id, name: String(name).trim(), relationship: rel, uhid } });
}
