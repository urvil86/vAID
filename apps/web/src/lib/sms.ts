/**
 * Send an SMS. Provider-agnostic so phone-OTP works with whatever the clinic
 * provisions, with a dev fallback that logs to the server console.
 *
 * Resolution order:
 *   1. Twilio        — TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
 *   2. Generic webhook — SMS_WEBHOOK_URL (POST { to, message }); wire any
 *      Indian DLT provider (MSG91 / 2Factor / Gupshup) behind it
 *   3. Dev console   — logs the message (no real SMS)
 *
 * NOTE: for production in India the sender must be DLT-registered. Twilio and
 * the major Indian gateways all support this; it is a provider-side setup.
 */
export function smsConfigured(): boolean {
  return Boolean(
    (process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM) ||
      process.env.SMS_WEBHOOK_URL
  );
}

export async function sendSms(to: string, message: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, SMS_WEBHOOK_URL } = process.env;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    const body = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: message });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );
    if (!res.ok) {
      throw new Error(`Twilio SMS failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  if (SMS_WEBHOOK_URL) {
    const res = await fetch(SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message }),
    });
    if (!res.ok) {
      throw new Error(`SMS webhook failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  // Dev fallback — no provider configured. The OTP is printed to the server log.
  console.log(`[sms:dev] To ${to}: ${message}`);
}
