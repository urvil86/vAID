import sql from '@/app/api/utils/sql';
import { getClientIp } from '@/lib/rate-limit';

/**
 * Public prescription view resolved by an expiring share token (no auth). The
 * token is minted by /api/share. Expired or unknown tokens don't resolve; every
 * view is audit-logged. Returns only the fields needed to display the Rx.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return Response.json({ error: 'Not found' }, { status: 404 });

  const [link] = await sql`
    SELECT prescription_id, expires_at FROM share_tokens WHERE token = ${token}
  `;
  if (!link) return Response.json({ error: 'Not found' }, { status: 404 });
  if (new Date(link.expires_at as string) < new Date()) {
    return Response.json({ error: 'This link has expired.' }, { status: 410 });
  }

  const [rx] = await sql`
    SELECT p.id, p.items_json, p.advice, p.follow_up_date, p.generated_at,
           u.name AS patient_name,
           d.name AS doctor_name, dp.registration_no, dp.specialty,
           c.name AS clinic_name, c.address AS clinic_address, c.rx_header_json
    FROM prescriptions p
    JOIN visits v ON p.visit_id = v.id
    JOIN "user" u ON v.patient_id = u.id
    JOIN "user" d ON p.doctor_id = d.id
    LEFT JOIN doctor_profiles dp ON p.doctor_id = dp.user_id
    LEFT JOIN clinics c ON v.clinic_id = c.id
    WHERE p.id = ${link.prescription_id}
  `;
  if (!rx) return Response.json({ error: 'Not found' }, { status: 404 });

  // Audit the (unauthenticated) view — actor is null, entity is the Rx.
  try {
    await sql`
      INSERT INTO audit_log (actor_user_id, action, entity, entity_id, ip)
      VALUES (${null}, 'rx_view', 'prescription', ${link.prescription_id}, ${getClientIp(request)})
    `;
  } catch {
    /* best-effort */
  }

  return Response.json({ prescription: rx });
}
