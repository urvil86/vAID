import sql from '@/app/api/utils/sql';
import { requireUser, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visitId');

  if (!visitId) {
    return Response.json({ error: 'Missing visitId' }, { status: 400 });
  }
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();
  await audit(request, ctx, 'read', 'intake', visitId);

  try {
    // Prefer the session that actually holds a transcript: a stray empty session
    // (e.g. re-opening intake after completion) must not shadow the completed
    // one and leave the review screen with nothing to structure.
    const [session] = await sql`
      SELECT * FROM intake_sessions WHERE visit_id = ${visitId}
      ORDER BY
        (transcript_native IS NOT NULL AND btrim(transcript_native) <> '') DESC,
        created_at DESC
      LIMIT 1
    `;

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    return Response.json(session);
  } catch (error) {
    console.error('Error fetching intake session:', error);
    return Response.json({ error: 'Failed to fetch intake session' }, { status: 500 });
  }
}
