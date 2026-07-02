'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Plus, Loader2, X } from 'lucide-react';
import { abnormalVitals } from '@/data/clinical-thresholds';

type ExtraVital = { label: string; value: string; unit?: string };

const FIELDS = [
  { key: 'systolic_bp', label: 'Sys', unit: '' },
  { key: 'diastolic_bp', label: 'Dia', unit: '' },
  { key: 'heart_rate', label: 'HR', unit: 'bpm' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'temperature_c', label: 'Temp', unit: '°C' },
  { key: 'resp_rate', label: 'RR', unit: '' },
  { key: 'weight_kg', label: 'Wt', unit: 'kg' },
  { key: 'glucose_mgdl', label: 'Glu', unit: '' },
] as const;

type VitalsRow = Record<string, number | string | null>;

export default function VitalsPanel({ visitId }: { visitId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [customs, setCustoms] = useState<ExtraVital[]>([]);

  const { data } = useQuery({
    queryKey: ['vitals', visitId],
    queryFn: async () => (await fetch(`/api/vitals?visitId=${visitId}`)).json(),
    enabled: !!visitId,
  });
  const latest = (data?.vitals?.[0] as VitalsRow) || null;
  const abnormal = latest ? abnormalVitals(latest) : [];
  const selfReported = latest?.entry_source === 'patient_self_report';

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { visitId };
      for (const f of FIELDS) {
        const val = form[f.key]?.trim();
        if (val) body[f.key] = Number(val);
      }
      const extra = customs
        .map((c) => ({ label: c.label.trim(), value: c.value.trim(), unit: (c.unit || '').trim() }))
        .filter((c) => c.label && c.value);
      if (extra.length) body.extra = extra;
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Failed to save vitals');
      }
      return res.json();
    },
    onSuccess: () => {
      setAdding(false);
      setForm({});
      setCustoms([]);
      qc.invalidateQueries({ queryKey: ['vitals', visitId] });
    },
  });

  return (
    <Card className="bg-doctor-raised border-doctor-muted/20 mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="mono-tag text-doctor-muted text-[10px] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-doctor-accent" /> VITALS
            {selfReported && <span className="text-amber-400">· self-reported</span>}
          </p>
          {!adding && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(true)}
              className="h-7 text-doctor-accent text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          )}
        </div>

        {!adding && latest && (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {FIELDS.filter((f) => latest[f.key] != null).map((f) => (
              <span key={f.key} className="text-sm text-doctor-text">
                <span className="text-doctor-muted text-xs">{f.label} </span>
                {String(latest[f.key])}
                {f.unit}
              </span>
            ))}
            {Array.isArray(latest.extra_json) &&
              (latest.extra_json as unknown as ExtraVital[]).map((c, i) => (
                <span key={`x-${i}`} className="text-sm text-doctor-text">
                  <span className="text-doctor-muted text-xs">{c.label} </span>
                  {c.value}
                  {c.unit || ''}
                </span>
              ))}
            {FIELDS.every((f) => latest[f.key] == null) &&
              !(Array.isArray(latest.extra_json) && latest.extra_json.length) && (
                <span className="text-doctor-muted text-sm">—</span>
              )}
          </div>
        )}
        {!adding && !latest && <p className="text-doctor-muted text-sm">No vitals recorded.</p>}
        {!adding && abnormal.length > 0 && (
          <p className="text-red-400 text-xs mt-2">⚠ {abnormal.join(' · ')}</p>
        )}

        {adding && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="mono-tag text-[9px] text-doctor-muted">
                    {f.label}
                    {f.unit && ` (${f.unit})`}
                  </span>
                  <input
                    inputMode="decimal"
                    value={form[f.key] || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="bg-doctor-bg border border-doctor-muted/20 rounded px-2 py-1 text-sm text-doctor-text outline-none focus:border-doctor-accent"
                  />
                </label>
              ))}
            </div>
            {/* Custom vitals — any measurement beyond the fixed set */}
            {customs.length > 0 && (
              <div className="space-y-2">
                {customs.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <input
                      placeholder="Label (e.g. Pain score)"
                      value={c.label}
                      onChange={(e) =>
                        setCustoms((cs) => cs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      className="bg-doctor-bg border border-doctor-muted/20 rounded px-2 py-1 text-sm text-doctor-text outline-none focus:border-doctor-accent"
                    />
                    <input
                      placeholder="Value"
                      value={c.value}
                      onChange={(e) =>
                        setCustoms((cs) => cs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                      }
                      className="bg-doctor-bg border border-doctor-muted/20 rounded px-2 py-1 text-sm text-doctor-text outline-none focus:border-doctor-accent"
                    />
                    <input
                      placeholder="Unit"
                      value={c.unit || ''}
                      onChange={(e) =>
                        setCustoms((cs) => cs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
                      }
                      className="w-16 bg-doctor-bg border border-doctor-muted/20 rounded px-2 py-1 text-sm text-doctor-text outline-none focus:border-doctor-accent"
                    />
                    <button
                      onClick={() => setCustoms((cs) => cs.filter((_, j) => j !== i))}
                      className="text-doctor-muted hover:text-red-400"
                      aria-label="Remove field"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setCustoms((cs) => [...cs, { label: '', value: '', unit: '' }])}
              className="flex items-center gap-1.5 text-doctor-accent text-xs font-semibold hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add another vital
            </button>

            <div className="flex items-center gap-2 justify-end">
              {save.isError && (
                <span className="text-red-400 text-xs mr-auto">{(save.error as Error).message}</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setForm({});
                }}
                className="text-doctor-muted"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="bg-doctor-accent text-doctor-bg font-bold gap-1"
              >
                {save.isPending && <Loader2 className="w-3.5 h-3.5" />} Save vitals
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
