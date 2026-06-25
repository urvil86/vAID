import sql from '@/app/api/utils/sql';

export async function GET() {
  try {
    const clinics = await sql`
      SELECT * FROM clinics ORDER BY created_at DESC
    `;
    return Response.json(clinics);
  } catch (error) {
    console.error('Error fetching clinics:', error);
    return Response.json({ error: 'Failed to fetch clinics' }, { status: 500 });
  }
}
