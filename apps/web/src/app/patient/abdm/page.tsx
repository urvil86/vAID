'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { Loader2, BadgeCheck, ChevronRight, AlertCircle } from 'lucide-react';

/**
 * ABDM / ABHA — honest scaffold (mockup 13). Live ABDM linkage needs sandbox
 * onboarding + milestone certification; visit/note data is already modelled to
 * ABDM record formats (Sprint 3.1 FHIR resources) so it can map later. No fake
 * handshake here.
 */
export default function PatientAbdmPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.push('/account/signin?callbackUrl=/patient/abdm');
  }, [isPending, session, router]);

  const { data: profile } = useQuery<{ abha_id?: string; abha_verified?: boolean } | null>({
    queryKey: ['profile-abdm'],
    queryFn: async () => (await fetch('/api/profile')).json().then((j) => j.profile),
    enabled: !!session,
  });

  if (isPending) {
    return (
      <PatientLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
        </div>
      </PatientLayout>
    );
  }

  const abha = profile?.abha_id;

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col gap-5">
        <div>
          <p className="mono-tag text-patient-muted text-[10px] mb-1">ABDM / ABHA</p>
          <h1 className="text-2xl font-bold text-patient-ink">Your Health ID</h1>
        </div>

        <Card className="bg-patient-card border-patient-border">
          <CardContent className="p-4">
            <p className="mono-tag text-patient-muted text-[10px] mb-2">
              ABHA ID {abha ? '· CAPTURED' : ''}
            </p>
            {abha ? (
              <p className="text-2xl font-bold tracking-wider text-patient-ink flex items-center gap-2">
                {abha}
                {profile?.abha_verified && <BadgeCheck className="w-5 h-5 text-patient-accent" />}
              </p>
            ) : (
              <button
                onClick={() => router.push('/patient/settings')}
                className="text-patient-accent font-semibold hover:underline"
              >
                Add your ABHA in Settings →
              </button>
            )}
          </CardContent>
        </Card>

        {/* Honest scaffold */}
        <div className="rounded-2xl border border-patient-gold/40 bg-patient-gold/5 p-4">
          <p className="mono-tag text-patient-gold text-[10px] flex items-center gap-1.5 mb-2">
            <AlertCircle className="w-3.5 h-3.5" /> NOT YET CONNECTED
          </p>
          <p className="text-sm text-patient-ink leading-relaxed">
            Live ABDM linkage requires sandbox onboarding and milestone certification. Your visit &amp;
            note data is modelled to ABDM record formats so it can map later — no fake handshake here.
          </p>
        </div>

        <Card className="bg-patient-card border-patient-border">
          <CardContent className="p-0 divide-y divide-patient-border">
            {[
              { label: 'Map visit → ABDM record', tag: 'MODELLED' },
              { label: 'Push to health locker', tag: 'PENDING CERT' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between p-4">
                <span className="text-patient-ink">{r.label}</span>
                <span className="mono-tag text-patient-muted text-[9px] flex items-center gap-1">
                  {r.tag} <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button
          disabled
          className="w-full h-12 bg-patient-border text-patient-muted font-bold rounded-full cursor-not-allowed"
        >
          Link ABHA · disabled
        </Button>
      </div>
    </PatientLayout>
  );
}
