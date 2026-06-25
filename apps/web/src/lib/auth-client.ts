/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 better-auth client. Signup/signin pages and the mobile app all
 * import from here. Safe to leave as-is; unsafe to pass an explicit baseURL
 * (relative paths are correct — the pages + mobile WebView handle origin
 * routing via trustedOrigins on the server).
 */
import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient } from 'better-auth/client/plugins';

// phoneNumberClient adds authClient.phoneNumber.sendOtp/verify + signIn.phoneNumber.
// Additive only — no baseURL is set (relative paths stay correct).
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
