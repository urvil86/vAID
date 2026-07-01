/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 better-auth catch-all. `toNextJsHandler(auth)` wires up every
 * better-auth endpoint (/sign-up/email, /sign-in/email, /get-session, ...).
 * Do not hand-roll your own routes for these paths; it will conflict with
 * this handler and break signup/signin/session lookup.
 *
 * ADDITIVE ONLY: POST is wrapped with a rate-limit pre-check (see
 * auth-rate-limit.ts) that delegates to the original handler when under the cap.
 * The toNextJsHandler wiring is preserved; GET is untouched.
 */
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { enforceAuthRateLimits } from "@/lib/auth-rate-limit";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(req: Request) {
  const limited = await enforceAuthRateLimits(req);
  if (limited) return limited;
  return handlers.POST(req);
}
