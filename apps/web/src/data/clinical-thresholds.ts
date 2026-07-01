/**
 * ⚠ CLINICAL REVIEW REQUIRED ⚠
 * These vitals ranges + abnormal thresholds MUST be reviewed and signed off by a
 * practising physician before production use. They are intentionally in one file
 * so that review is easy. Values are conservative adult defaults.
 */

// Accept-range for entry validation (mirrors the DB CHECK constraints).
export const VITALS_RANGES = {
  systolic_bp: { min: 50, max: 300 },
  diastolic_bp: { min: 20, max: 200 },
  heart_rate: { min: 20, max: 300 },
  temperature_c: { min: 30, max: 45 },
  resp_rate: { min: 4, max: 80 },
  spo2: { min: 50, max: 100 },
  weight_kg: { min: 0.5, max: 400 },
  height_cm: { min: 20, max: 260 },
  glucose_mgdl: { min: 20, max: 900 },
} as const;

// Thresholds that make a value clinically notable → feed the attention box.
export const VITALS_ABNORMAL = {
  spo2_low: 92, // %
  systolic_high: 180, // mmHg
  systolic_low: 90,
  diastolic_high: 110,
  temperature_high: 38.5, // °C
  temperature_low: 35,
  heart_rate_high: 120, // bpm
  heart_rate_low: 45,
  resp_rate_high: 24,
  glucose_high: 250, // mg/dL
  glucose_low: 70,
} as const;

export type VitalsRow = {
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  heart_rate?: number | null;
  temperature_c?: number | null;
  resp_rate?: number | null;
  spo2?: number | null;
  glucose_mgdl?: number | null;
};

/** Human-readable list of abnormal findings for a vitals row (for the attention box). */
export function abnormalVitals(v: VitalsRow): string[] {
  const out: string[] = [];
  const t = VITALS_ABNORMAL;
  if (v.spo2 != null && v.spo2 < t.spo2_low) out.push(`Low SpO₂ (${v.spo2}%)`);
  if (v.systolic_bp != null && v.systolic_bp > t.systolic_high)
    out.push(`High BP (${v.systolic_bp}/${v.diastolic_bp ?? '?'})`);
  if (v.systolic_bp != null && v.systolic_bp < t.systolic_low)
    out.push(`Low BP (${v.systolic_bp}/${v.diastolic_bp ?? '?'})`);
  if (v.diastolic_bp != null && v.diastolic_bp > t.diastolic_high)
    out.push(`High diastolic (${v.diastolic_bp})`);
  if (v.temperature_c != null && v.temperature_c > t.temperature_high)
    out.push(`Fever (${v.temperature_c}°C)`);
  if (v.temperature_c != null && v.temperature_c < t.temperature_low)
    out.push(`Low temp (${v.temperature_c}°C)`);
  if (v.heart_rate != null && v.heart_rate > t.heart_rate_high)
    out.push(`Tachycardia (${v.heart_rate})`);
  if (v.heart_rate != null && v.heart_rate < t.heart_rate_low)
    out.push(`Bradycardia (${v.heart_rate})`);
  if (v.resp_rate != null && v.resp_rate > t.resp_rate_high)
    out.push(`High resp rate (${v.resp_rate})`);
  if (v.glucose_mgdl != null && v.glucose_mgdl > t.glucose_high)
    out.push(`High glucose (${v.glucose_mgdl})`);
  if (v.glucose_mgdl != null && v.glucose_mgdl < t.glucose_low)
    out.push(`Low glucose (${v.glucose_mgdl})`);
  return out;
}
