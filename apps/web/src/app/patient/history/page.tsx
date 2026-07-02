'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileText, BadgeCheck, ExternalLink, Plus } from 'lucide-react';
import PatientSummaryCard from '@/components/PatientSummaryCard';
import { downloadRecordPdf } from '@/lib/record-pdf';

type PatientVisit = {
  id: string;
  token_no: string;
  status: string;
  created_at: string;
  clinic_name?: string;
  patient_name?: string;
  is_self?: boolean;
  structured_note_json?: { chief_complaint?: string } | null;
};

export default function PatientHistoryPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const patientId = session?.user?.id;

  // Not logged in → send to sign-in and come back here.
  useEffect(() => {
    if (!isPending && !session) {
      router.push('/account/signin?callbackUrl=/patient/history');
    }
  }, [isPending, session, router]);

  const { data: visits, isLoading } = useQuery<PatientVisit[]>({
    queryKey: ['patient-visits', patientId],
    queryFn: async () => {
      // family=1 folds in visits for dependents the account holder manages.
      const res = await fetch(`/api/visits?patientId=${patientId}&family=1`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId,
  });

  const { data: profile } = useQuery<{ abha_id?: string; uhid?: string } | null>({
    queryKey: ['patient-profile', patientId],
    queryFn: async () => {
      const res = await fetch('/api/profile');
      if (!res.ok) return null;
      return (await res.json()).profile;
    },
    enabled: !!patientId,
  });

  if (isPending || (patientId && isLoading)) {
    return (
      <PatientLayout showBack={false}>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
        </div>
      </PatientLayout>
    );
  }

  const list = Array.isArray(visits) ? visits : [];

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="mono-tag text-patient-muted mb-1">YOUR VISITS</p>
            <h1 className="text-2xl font-bold text-patient-ink">Visit history</h1>
          </div>
          <button
            onClick={() => void downloadRecordPdf()}
            className="text-sm font-semibold text-patient-accent hover:underline whitespace-nowrap"
          >
            Download my record
          </button>
        </div>

        {/* Start another visit — always available once a patient has history. */}
        {list.length > 0 && (
          <Button
            onClick={() => router.push('/patient/check-in')}
            className="w-full h-12 mb-5 bg-patient-accent hover:bg-patient-accent/90 text-white font-bold rounded-full flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> New check-in
          </Button>
        )}

        <AbhaCard initial={profile?.abha_id || ''} uhid={profile?.uhid || ''} />

        {patientId && <PatientSummaryCard patientId={patientId} variant="patient" />}

        {list.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-patient-muted">
            <FileText className="w-10 h-10" />
            <p>No visits yet. Scan your clinic&apos;s QR code, or start below.</p>
            <Button
              onClick={() => router.push('/patient/check-in')}
              className="h-12 px-6 bg-patient-accent hover:bg-patient-accent/90 text-white font-bold rounded-full"
            >
              Start check-in
            </Button>
          </div>
        ) : (
          <div className="space-y-3 flex-1 overflow-y-auto pb-6">
            {list.map((v) => {
              // A visit still in intake is resumable; a completed intake goes to
              // the review screen. Later stages (consult/done) are view-only.
              const resumeIntake = v.status === 'INTAKE IN PROGRESS' || v.status === 'CHECKED IN';
              const toReview = v.status === 'INTAKE COMPLETE';
              const clickable = resumeIntake || toReview;
              const go = () => {
                if (resumeIntake) router.push(`/patient/intake/${v.id}`);
                else if (toReview) router.push(`/patient/review/${v.id}`);
              };
              return (
                <Card
                  key={v.id}
                  onClick={clickable ? go : undefined}
                  className={`bg-patient-card border-patient-border ${
                    clickable ? 'cursor-pointer hover:border-patient-accent transition-colors' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="mono-tag text-patient-muted text-[10px]">
                        {v.token_no} · {v.clinic_name || 'Clinic'}
                      </p>
                      <span className="mono-tag text-[10px] text-patient-accent">{v.status}</span>
                    </div>
                    {v.is_self === false && v.patient_name && (
                      <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-patient-accent/10 text-patient-accent text-[11px] font-semibold">
                        {v.patient_name}
                      </span>
                    )}
                    <p className="font-bold text-patient-ink">
                      {v.structured_note_json?.chief_complaint || 'Intake recorded'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-patient-muted text-xs" suppressHydrationWarning>
                        {new Date(v.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {resumeIntake && (
                        <span className="text-xs font-semibold text-patient-accent">
                          Tap to resume →
                        </span>
                      )}
                      {toReview && (
                        <span className="text-xs font-semibold text-patient-accent">
                          Review &amp; submit →
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PatientLayout>
  );
}

function AbhaCard({ initial, uhid }: { initial: string; uhid: string }) {
  const [abha, setAbha] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // Re-seed once the saved profile loads.
  useEffect(() => {
    setAbha(initial);
  }, [initial]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setErr('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abhaId: abha }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Could not save. Please try again.');
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const hasAbha = initial.trim().length > 0;

  return (
    <Card className="bg-patient-card border-patient-border mb-5">
      <CardContent className="p-4 space-y-3">
        {/* Permanent V-Aid patient ID */}
        <div className="flex items-center justify-between">
          <p className="mono-tag text-patient-muted text-[10px]">YOUR V-AID ID</p>
          <p className="mono-tag text-patient-ink text-sm font-bold tracking-wider">
            {uhid || '—'}
          </p>
        </div>

        <div className="h-px bg-patient-border" />

        <div className="flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 text-patient-accent" />
          <p className="mono-tag text-patient-muted text-[10px]">ABHA HEALTH ID (OPTIONAL)</p>
        </div>
        <input
          value={abha}
          onChange={(e) => {
            setAbha(e.target.value);
            setSaved(false);
          }}
          placeholder="14-digit ABHA number or you@abdm"
          className="w-full rounded-xl border border-patient-border bg-white px-3 h-12 text-[16px] text-patient-ink outline-none focus:border-patient-accent transition-colors"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            onClick={save}
            disabled={saving}
            className="h-11 px-6 bg-patient-accent hover:bg-patient-accent/90 text-white font-bold rounded-full disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? 'Saved ✓' : 'Save'}
          </Button>
          <a
            href="https://abha.abdm.gov.in/abha/v3/register"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-patient-accent font-semibold inline-flex items-center gap-1 hover:underline"
          >
            Don&apos;t have one? Create ABHA <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {!hasAbha && !err && (
          <p className="text-xs text-patient-muted">
            Linking your ABHA keeps all your visits and reports in one place across clinics.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
