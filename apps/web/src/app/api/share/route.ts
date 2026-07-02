import { randomBytes } from 'node:crypto';
import sql from '@/app/api/utils/sql';
import { getMessagingProvider, type MessagingChannel } from '@/lib/messaging';
import { requireStaff, canAccessPrescription, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { logEvent } from '@/lib/events';

const SHARE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Share a prescription over WhatsApp/SMS via the messaging provider
 * abstraction. When no provider is configured (current build), responds
 * honestly with delivered:false + a shareable link the caller can copy — never
 * a fake "sent" state. The attempted channel is logged on the prescription.
 */
export async function POST(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await request.json();
    const { prescriptionId, channel, to } = body as {
      prescriptionId?: string;
      channel?: MessagingChannel;
      to?: string;
    };

    if (!prescriptionId) {
      return Response.json({ error: 'prescriptionId is required' }, { status: 400 });
    }
    if (!(await canAccessPrescription(ctx, prescriptionId))) return forbidden();
    await audit(request, ctx, 'share', 'prescription', prescriptionId);
    await logEvent('rx_shared', null, ctx.clinicId, { prescriptionId });

    const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:4000';
    // Mint an expiring, unguessable public link (128-bit token, 72h). Raw-UUID
    // prescription URLs are no longer publicly resolvable.
    const token = randomBytes(16).toString('base64url');
    await sql`
      INSERT INTO share_tokens (token, prescription_id, created_by, expires_at)
      VALUES (${token}, ${prescriptionId}, ${ctx.userId}, ${new Date(Date.now() + SHARE_TTL_MS)})
    `;
    const shareUrl = `${baseUrl}/rx/${token}`;

    // Log the channel as attempted/shared on the prescription.
    if (channel) {
      await sql`
        UPDATE prescriptions
        SET shared_channels_json = (
          coalesce(shared_channels_json, '[]'::jsonb) || ${JSON.stringify([channel])}::jsonb
        )
        WHERE id = ${prescriptionId}
      `;
    }

    const provider = getMessagingProvider();
    if (!provider || !channel || !to) {
      return Response.json({
        delivered: false,
        reason: 'provider_not_configured',
        shareUrl,
        message:
          'No WhatsApp/SMS provider is connected yet. Copy the link to share, or configure a provider (Gupshup/Twilio + DLT) to send directly.',
      });
    }

    const result = await provider.send({
      to,
      channel,
      body: `Your prescription from your visit is ready: ${shareUrl}`,
    });

    return Response.json({ delivered: result.ok, providerId: result.id, error: result.error, shareUrl });
  } catch (error) {
    console.error('Error sharing prescription:', error);
    return Response.json({ error: 'Failed to share' }, { status: 500 });
  }
}
