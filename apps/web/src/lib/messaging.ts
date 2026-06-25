/**
 * Messaging provider abstraction (WhatsApp / SMS).
 *
 * The share + notification flows call through this so the provider can be
 * swapped. No provider is wired in this build: WhatsApp needs a Business API
 * provider (Gupshup/Twilio) and SMS to Indian numbers needs a DLT-registered
 * sender + approved templates (see build spec §5.3) — onboarding steps, not
 * something the app can self-serve. Until configured, getMessagingProvider()
 * returns null and callers fall back to a shareable link.
 */

export type MessagingChannel = 'whatsapp' | 'sms';

export type MessagingProvider = {
  id: string;
  send(args: { to: string; channel: MessagingChannel; body: string }): Promise<{
    ok: boolean;
    id?: string;
    error?: string;
  }>;
};

export function getMessagingProvider(): MessagingProvider | null {
  // Wire a real provider here when credentials are configured, e.g.:
  // if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return twilioProvider();
  // if (process.env.GUPSHUP_API_KEY) return gupshupProvider();
  return null;
}

export function messagingConfigured(): boolean {
  return getMessagingProvider() !== null;
}
