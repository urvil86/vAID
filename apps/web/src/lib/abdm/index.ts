/**
 * ABDM (Ayushman Bharat Digital Mission) integration — verification only.
 *
 * Env-gated behind ABDM_ENV ('sandbox' | 'production'). When unset, ABHA is
 * captured but NOT verified (abha_verified stays false). This is the seam where
 * real ABDM sandbox verification drops in; we do NOT build full HIP data-exchange
 * here (see docs/abdm-path.md for the linkage design).
 *
 * The sandbox verification flow (documented, not wired to live creds here):
 *   1. session token   POST {ABDM_BASE}/v0.5/sessions   (client_id/secret)
 *   2. verify ABHA      POST .../v1/search/searchByHealthId  { healthId }
 * Returns whether the ABHA number/address resolves to a real account.
 */
export function abdmEnabled(): boolean {
  return Boolean(process.env.ABDM_ENV) && Boolean(process.env.ABDM_CLIENT_ID);
}

export type AbhaVerifyResult = { verified: boolean; reason?: string };

export async function verifyAbha(abhaId: string): Promise<AbhaVerifyResult> {
  const id = (abhaId || '').trim();
  if (!id) return { verified: false, reason: 'empty' };

  // Basic format gate (14-digit number, or an ABHA address like name@abdm).
  const looksValid = /^\d{2}-?\d{4}-?\d{4}-?\d{4}$/.test(id) || /@(sbx|abdm)$/i.test(id);
  if (!abdmEnabled()) {
    // Not wired to ABDM — accept the format but leave it UNVERIFIED.
    return { verified: false, reason: 'abdm_not_configured' };
  }
  if (!looksValid) return { verified: false, reason: 'bad_format' };

  try {
    const base = process.env.ABDM_BASE_URL || 'https://healthidsbx.abdm.gov.in/api';
    const tokenRes = await fetch(`${base}/v0.5/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: process.env.ABDM_CLIENT_ID,
        clientSecret: process.env.ABDM_CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) return { verified: false, reason: 'session_failed' };
    const { accessToken } = (await tokenRes.json()) as { accessToken?: string };
    if (!accessToken) return { verified: false, reason: 'no_token' };

    const searchRes = await fetch(`${base}/v1/search/searchByHealthId`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ healthId: id }),
    });
    return { verified: searchRes.ok };
  } catch (e) {
    console.error('[abdm] verify failed:', e);
    return { verified: false, reason: 'error' };
  }
}
