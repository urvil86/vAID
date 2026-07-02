'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Pill, AlertTriangle, X } from 'lucide-react';

type Summary = {
  problems: { problem: string; last_seen: string; visits: number }[];
  medications: string[];
  allergies: string[];
};

/**
 * Longitudinal patient summary, pinned to the top of the clinic and patient
 * history views. Fetches /api/patient-summary (which enforces the same
 * cross-clinic consent scoping as the visit history).
 */
export default function PatientSummaryCard({
  patientId,
  variant,
}: {
  patientId: string;
  variant: 'doctor' | 'patient';
}) {
  const qc = useQueryClient();
  const { data } = useQuery<Summary | null>({
    queryKey: ['patient-summary', patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patient-summary?patientId=${patientId}`);
      if (!res.ok) return null;
      return (await res.json()).summary;
    },
    enabled: !!patientId,
  });

  const resolve = useMutation({
    mutationFn: async (problem: string) => {
      await fetch('/api/patient-summary/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, patientId }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient-summary', patientId] }),
  });

  if (!data) return null;
  const empty =
    data.problems.length === 0 && data.medications.length === 0 && data.allergies.length === 0;
  if (empty) return null;

  const isDoctor = variant === 'doctor';
  const cardCls = isDoctor
    ? 'bg-doctor-raised border-doctor-muted/20'
    : 'bg-patient-card border-patient-border';
  const labelCls = isDoctor ? 'text-doctor-muted' : 'text-patient-muted';
  const textCls = isDoctor ? 'text-doctor-text' : 'text-patient-ink';
  const accent = isDoctor ? 'text-doctor-accent' : 'text-patient-accent';
  const chipCls = isDoctor ? 'bg-doctor-bg' : 'bg-black/5';

  return (
    <Card className={`${cardCls} mb-4`}>
      <CardContent className="p-5 space-y-4">
        <p className={`mono-tag text-[10px] ${labelCls}`}>PATIENT SUMMARY</p>

        {data.problems.length > 0 && (
          <div className="space-y-1.5">
            <p className={`mono-tag text-[10px] flex items-center gap-1.5 ${labelCls}`}>
              <Activity className={`w-3.5 h-3.5 ${accent}`} /> ACTIVE PROBLEMS
            </p>
            <div className="flex flex-wrap gap-2">
              {data.problems.map((p, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 text-sm ${textCls} ${chipCls} rounded-full pl-3 pr-2 py-1`}
                >
                  {p.problem}
                  {p.visits > 1 ? ` · ${p.visits}×` : ''}
                  <button
                    onClick={() => resolve.mutate(p.problem)}
                    disabled={resolve.isPending}
                    title="Mark resolved"
                    aria-label={`Mark ${p.problem} resolved`}
                    className="opacity-50 hover:opacity-100 disabled:opacity-30"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {data.medications.length > 0 && (
          <div className="space-y-1.5">
            <p className={`mono-tag text-[10px] flex items-center gap-1.5 ${labelCls}`}>
              <Pill className={`w-3.5 h-3.5 ${accent}`} /> CURRENT MEDICATIONS
            </p>
            <p className={`text-sm ${textCls}`}>{data.medications.join(', ')}</p>
          </div>
        )}

        {data.allergies.length > 0 && (
          <div className="space-y-1.5">
            <p className={`mono-tag text-[10px] flex items-center gap-1.5 ${labelCls}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> ALLERGIES
            </p>
            <p className="text-sm text-red-500 font-semibold">{data.allergies.join(', ')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
