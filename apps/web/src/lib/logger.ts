/**
 * Structured JSON logger. One line per event: level, msg, + fields
 * (route, visit_id, duration_ms, outcome, and for AI calls model/tier/latency/
 * tokens/cost). NEVER log PII — no transcripts, phone numbers, or note content.
 */
export type LogFields = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', msg: string, fields: LogFields = {}): void {
  try {
    const line = JSON.stringify({ level, msg, ...fields });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } catch {
    console.log(`${level}: ${msg}`);
  }
}

export const logger = {
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
  /** Log an AI call's cost/latency (no content). */
  aiCall: (fields: {
    model?: string;
    tier: string;
    latency_ms: number;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
    clinic_id?: string | null;
  }) => emit('info', 'ai_call', fields),
};
