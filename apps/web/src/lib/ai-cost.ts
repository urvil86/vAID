import sql from '@/app/api/utils/sql';

/**
 * Per-clinic daily AI spend tracking + budget gate. When a clinic crosses its
 * daily AI budget, structuring degrades to the deterministic local tier (never
 * blocks intake) and the admin dashboard shows a banner.
 */
const DAILY_BUDGET_USD = Number(process.env.AI_DAILY_BUDGET_USD || '5');

export async function recordAiSpend(
  clinicId: string | null,
  costUsd: number
): Promise<void> {
  if (!clinicId) return;
  try {
    await sql`
      INSERT INTO ai_usage (clinic_id, day, calls, spend_usd)
      VALUES (${clinicId}, current_date, 1, ${costUsd})
      ON CONFLICT (clinic_id, day) DO UPDATE SET
        calls = ai_usage.calls + 1,
        spend_usd = ai_usage.spend_usd + ${costUsd}
    `;
  } catch {
    /* best-effort */
  }
}

export async function overDailyBudget(clinicId: string | null): Promise<boolean> {
  if (!clinicId) return false;
  try {
    const [row] = await sql`
      SELECT spend_usd FROM ai_usage WHERE clinic_id = ${clinicId} AND day = current_date
    `;
    return Number(row?.spend_usd ?? 0) >= DAILY_BUDGET_USD;
  } catch {
    return false;
  }
}

export function dailyBudgetUsd(): number {
  return DAILY_BUDGET_USD;
}
