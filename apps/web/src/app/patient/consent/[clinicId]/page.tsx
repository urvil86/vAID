'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';

export default function PatientConsentPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('Hindi');
  const { data: session } = authClient.useSession();
  // Generate token number once on mount to avoid hydration mismatch
  const tokenRef = useRef('');
  useEffect(() => {
    tokenRef.current = `V-${Math.floor(Math.random() * 900) + 100}`;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved) setLanguage(saved);
  }, []);

  const s = getStrings(language);
  const isHindi = language === 'Hindi';

  const handleConsent = async () => {
    setLoading(true);
    try {
      const patientId = session?.user?.id ?? 'temp-patient';
      const tokenNo = tokenRef.current || 'V-001';
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          patientId,
          tokenNo,
        }),
      });
      if (!res.ok) throw new Error('Failed to create visit');
      const visit = await res.json();

      // DPDP: record the consent with the exact text shown, before intake.
      try {
        const textShown = [s.consentHeading, s.consentBody1, s.consentBody2, s.consentBody3].join(
          '\n'
        );
        await fetch('/api/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId,
            visitId: visit.id,
            scope: 'voice_health_intake',
            version: 'v1',
            textShown,
          }),
        });
      } catch (e) {
        // Non-blocking: don't trap the patient if the consent log write fails.
        console.warn('[consent] failed to record consent', e);
      }

      router.push(`/patient/intake/${visit.id}`);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col">
        <div className="mb-8">
          <p className="mono-tag text-patient-muted mb-2">{s.consentTitle}</p>
          <h1 className={`text-2xl font-bold ${isHindi ? 'hindi' : ''}`}>{s.consentHeading}</h1>
        </div>

        <Card className="flex-1 bg-patient-card border-patient-border mb-6 overflow-hidden flex flex-col">
          <CardContent
            className={`p-6 overflow-y-auto leading-relaxed space-y-4 ${isHindi ? 'hindi text-lg' : 'text-base'}`}
          >
            <p>{s.consentBody1}</p>
            <p>{s.consentBody2}</p>
            <p>{s.consentBody3}</p>

            {/* Always show both language versions for maximum clarity */}
            {isHindi && (
              <div className="mt-4 pt-4 border-t border-patient-border text-base font-sans text-patient-muted space-y-2">
                <p>
                  We collect your voice and health information to prepare a note for your doctor.
                </p>
                <p>
                  This information is shared only with your treating doctor and clinic staff. You
                  can withdraw your consent at any time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            className="w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full"
            onClick={handleConsent}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : s.consentButton}
          </Button>
          <Button
            variant="ghost"
            className={`w-full text-patient-muted ${isHindi ? 'hindi' : ''}`}
            onClick={() => router.back()}
          >
            {s.goBack}
          </Button>
        </div>
      </div>
    </PatientLayout>
  );
}
