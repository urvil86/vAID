import { z } from 'zod';
import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';
import { parseBody } from '@/lib/validation';
import { VITALS_RANGES } from '@/data/clinical-thresholds';

const R = VITALS_RANGES;
const inRange = (min: number, max: number) =>
  z.number().min(min).max(max).nullable().optional();

const vitalsSchema = z
  .object({
    visitId: z.string().min(1),
    systolic_bp: inRange(R.systolic_bp.min, R.systolic_bp.max),
    diastolic_bp: inRange(R.diastolic_bp.min, R.diastolic_bp.max),
    heart_rate: inRange(R.heart_rate.min, R.heart_rate.max),
    temperature_c: inRange(R.temperature_c.min, R.temperature_c.max),
    resp_rate: inRange(R.resp_rate.min, R.resp_rate.max),
    spo2: inRange(R.spo2.min, R.spo2.max),
    weight_kg: inRange(R.weight_kg.min, R.weight_kg.max),
    height_cm: inRange(R.height_cm.min, R.height_cm.max),
    glucose_mgdl: inRange(R.glucose_mgdl.min, R.glucose_mgdl.max),
    // Custom vitals the doctor adds beyond the fixed set (free label/value/unit).
    extra: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(40),
          value: z.string().trim().min(1).max(40),
          unit: z.string().trim().max(20).optional(),
        })
      )
      .max(20)
      .optional(),
  })
  .strip();

// GET /api/vitals?visitId=... — vitals for a visit (newest first)
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const visitId = new URL(request.url).searchParams.get('visitId');
  if (!visitId) return Response.json({ error: 'visitId is required' }, { status: 400 });
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  const rows = await sql`SELECT * FROM vitals WHERE visit_id = ${visitId} ORDER BY recorded_at DESC`;
  return Response.json({ vitals: rows });
}

// POST /api/vitals — staff-measured or patient self-reported vitals for a visit.
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const parsed = await parseBody(request, vitalsSchema);
  if (parsed.error) return parsed.error;
  const v = parsed.data;

  if (!(await canAccessVisit(ctx, v.visitId))) return forbidden();

  // Staff entry is trusted-measured; anyone else (the patient) is self-report.
  const staff = isStaff(ctx.role) || ctx.isDevBypass;
  const entrySource = staff ? 'staff' : 'patient_self_report';
  const recordedBy = staff ? ctx.userId : null;

  const [visit] = await sql`SELECT patient_id FROM visits WHERE id = ${v.visitId}`;
  if (!visit) return Response.json({ error: 'Visit not found' }, { status: 404 });

  const extra = v.extra && v.extra.length ? JSON.stringify(v.extra) : null;
  const [row] = await sql`
    INSERT INTO vitals (
      visit_id, patient_id, recorded_by, entry_source,
      systolic_bp, diastolic_bp, heart_rate, temperature_c, resp_rate, spo2,
      weight_kg, height_cm, glucose_mgdl, extra_json
    ) VALUES (
      ${v.visitId}, ${visit.patient_id}, ${recordedBy}, ${entrySource},
      ${v.systolic_bp ?? null}, ${v.diastolic_bp ?? null}, ${v.heart_rate ?? null},
      ${v.temperature_c ?? null}, ${v.resp_rate ?? null}, ${v.spo2 ?? null},
      ${v.weight_kg ?? null}, ${v.height_cm ?? null}, ${v.glucose_mgdl ?? null}, ${extra}
    )
    RETURNING *
  `;
  await audit(request, ctx, 'create', 'vitals', v.visitId);
  return Response.json({ vitals: row });
}
