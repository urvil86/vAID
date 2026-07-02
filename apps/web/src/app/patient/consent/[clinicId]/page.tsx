'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';

export default function PatientConsentPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
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

      // DPDP: recording consent is BLOCKING — intake must never begin without a
      // consent record. If this write fails, we do NOT proceed to intake.
      const textShown = [s.consentHeading, s.consentBody1, s.consentBody2, s.consentBody3].join(
        '\n'
      );
      const cRes = await fetch('/api/consent', {
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
      if (!cRes.ok) throw new Error('Failed to record consent');

      // Secondary cross-clinic history-share consent — best-effort (its absence
      // only narrows what staff can see; it never blocks intake).
      fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          visitId: visit.id,
          scope: 'history_share',
          version: 'v1',
          textShown:
            'I allow my treating doctor at this clinic to view my V-Aid health record from other clinics to help with my care.',
        }),
      }).catch((e) => console.warn('[consent] history_share write failed', e));

      router.push(`/patient/intake/${visit.id}`);
    } catch (error) {
      console.error(error);
      setError(
        isHindi
          ? 'सहमति दर्ज नहीं हो सकी। कृपया फिर से प्रयास करें।'
          : 'We could not record your consent. Please try again.'
      );
      setLoading(false);
    }
  };

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col">
        <div className="mb-6">
          <p className="mono-tag text-patient-muted text-[10px] mb-2">{s.consentTitle}</p>
          <h1 className={`text-2xl font-bold leading-snug text-patient-ink ${isHindi ? 'hindi' : ''}`}>
            {isHindi ? 'हम आपकी आवाज़ रिकॉर्ड करेंगे।' : s.consentHeading}
          </h1>
          <p className={`text-patient-muted mt-2 ${isHindi ? 'hindi text-base' : 'text-sm'}`}>
            {s.consentBody1}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto">
          {[
            {
              t: isHindi ? 'हम क्या लेते हैं' : 'What we collect',
              d: isHindi ? 'आपकी आवाज़ और आपके बताए स्वास्थ्य विवरण।' : 'Your voice and the health details you share.',
            },
            {
              t: isHindi ? 'कौन देखता है' : 'Who sees it',
              d: s.consentBody2,
            },
            {
              t: isHindi ? 'आप नियंत्रण में हैं' : "You're in control",
              d: isHindi ? 'कभी भी सहमति वापस लें — आपका डेटा हटा दिया जाता है।' : 'Withdraw any time — your data is deleted.',
            },
          ].map((b) => (
            <div key={b.t} className="flex gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-patient-accent shrink-0" />
              <div>
                <p className={`font-bold text-patient-ink ${isHindi ? 'hindi' : ''}`}>{b.t}</p>
                <p className={`text-patient-muted ${isHindi ? 'hindi text-base' : 'text-sm'}`}>{b.d}</p>
              </div>
            </div>
          ))}
          {process.env.NEXT_PUBLIC_SARVAM_ENABLED === '1' && (
            <div className="flex gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-patient-accent shrink-0" />
              <p className="text-patient-muted text-sm">
                Your voice may be transcribed by a secure service (Sarvam) to prepare your note,
                then discarded.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-patient-border bg-patient-card px-4 py-3">
            <p className="mono-tag text-patient-muted text-[10px]">
              v2.1 · RECORDED WITH TIMESTAMP
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 text-center">
              {error}
            </div>
          )}
          <Button
            className={`w-full h-14 bg-patient-ink hover:bg-patient-ink/90 text-white text-lg font-bold rounded-full flex items-center justify-center gap-2 ${isHindi ? 'hindi' : ''}`}
            onClick={handleConsent}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin w-5 h-5" />
            ) : (
              <>
                {s.consentButton} <span className="mono-tag text-[11px] opacity-70">I AGREE</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className={`w-full text-patient-muted ${isHindi ? 'hindi' : ''}`}
            onClick={() => router.back()}
          >
            {isHindi ? 'अभी नहीं' : 'Not now'}
          </Button>
        </div>
      </div>
    </PatientLayout>
  );
}
