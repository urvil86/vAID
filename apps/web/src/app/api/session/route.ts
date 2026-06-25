import { NextRequest, NextResponse } from 'next/server';
import { getSessionOrDev } from '@/lib/dev-auth';

export async function GET(request: NextRequest) {
  const session = await getSessionOrDev({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: session.user,
    session: session.session,
  });
}
