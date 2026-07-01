import sql from '@/app/api/utils/sql';

/**
 * Public clinic list — MINIMAL fields only. The check-in landing needs a
 * clinic's name, branding, and default language before the patient
 * authenticates; it must NOT leak rx_header_json or other settings. Staff fetch
 * the full clinic record (for the admin settings form) via the authenticated
 * [clinicId] route.
 */
export async function GET() {
  try {
    const clinics = await sql`
      SELECT id, name, default_language, branding_json
      FROM clinics
      ORDER BY created_at DESC
    `;
    return Response.json(clinics);
  } catch (error) {
    console.error('Error fetching clinics:', error);
    return Response.json({ error: 'Failed to fetch clinics' }, { status: 500 });
  }
}
