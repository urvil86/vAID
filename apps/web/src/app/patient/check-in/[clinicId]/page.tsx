'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { AVAILABLE_LANGUAGES, LANG_STORAGE_KEY, getStrings } from '@/lib/i18n';

// Testing-phase auth bypass — see src/lib/dev-auth.ts. Off when the env var is unset.
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1';

export default function PatientCheckInPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const [language, setLanguage] = useState('Hindi');
  const [phone, setPhone] = useState('');
  const [showAllLangs, setShowAllLangs] = useState(false);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved) {
      setLanguage(saved);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const lang = (await res.json())?.profile?.preferred_language;
          if (lang) setLanguage(lang);
        }
      } catch {
        /* keep default */
      }
    })();
  }, []);

  const s = getStrings(language);
  const isHindi = language === 'Hindi';

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['clinic', clinicId],
    queryFn: async () => {
      const res = await fetch(`/api/clinics/${clinicId}`);
      if (!res.ok) throw new Error('Clinic not found');
      return res.json();
    },
  });

  const selectLang = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  };

  const handleStart = () => {
    localStorage.setItem(LANG_STORAGE_KEY, language);
    // Capture phone on the profile (best-effort; OTP verification is paused).
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${digits.slice(-10)}` }),
      }).catch(() => {});
    }
    if (session || DEV_AUTH_BYPASS) router.push(`/patient/consent/${clinicId}`);
    else router.push(`/account/signin?callbackUrl=/patient/consent/${clinicId}`);
  };

  if (isLoading) {
    return (
      <PatientLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-patient-accent w-6 h-6" />
        </div>
      </PatientLayout>
    );
  }

  const shown = showAllLangs ? AVAILABLE_LANGUAGES : AVAILABLE_LANGUAGES.slice(0, 3);
  const more = AVAILABLE_LANGUAGES.length - 3;

  return (
    <PatientLayout>
      <div className="flex-1 px-6 py-8 flex flex-col">
        {/* Clinic tag */}
        <p className="mono-tag text-patient-muted text-[11px] flex items-center gap-2 mb-6">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-patient-accent" />
          {(clinic?.name || 'Clinic').toUpperCase()}
        </p>

        {/* Greeting */}
        <h1 className={`text-3xl font-bold leading-snug text-patient-ink ${isHindi ? 'hindi' : ''}`}>
          {s.checkInSubtitle}
        </h1>

        {/* Language chips */}
        <div className="mt-8">
          <p className="mono-tag text-patient-muted text-[10px] mb-3">{s.selectLanguage}</p>
          <div className="flex flex-wrap gap-2">
            {shown.map((l) => {
              const selected = language === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => selectLang(l.code)}
                  className={`px-4 py-2 rounded-full text-base font-semibold border transition-colors ${
                    selected
                      ? 'bg-patient-ink text-white border-patient-ink'
                      : 'bg-transparent text-patient-ink border-patient-border hover:border-patient-accent/60'
                  }`}
                >
                  {l.nativeLabel}
                </button>
              );
            })}
            {!showAllLangs && more > 0 && (
              <button
                onClick={() => setShowAllLangs(true)}
                className="px-4 py-2 rounded-full text-base font-medium border border-patient-border text-patient-muted hover:border-patient-accent/60"
              >
                +{more} more
              </button>
            )}
          </div>
          <p className="text-sm text-patient-muted mt-3">
            {isHindi
              ? 'आप बीच में अंग्रेज़ी शब्द भी बोल सकते हैं — हम समझ लेंगे।'
              : 'You can mix English words freely — we understand.'}
          </p>
        </div>

        {/* Phone */}
        <label className="mt-8 block">
          <div className="flex items-center rounded-xl border border-patient-border bg-patient-card h-14 px-4 focus-within:border-patient-accent transition-colors">
            <span className="text-patient-muted font-medium mr-2">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              className="flex-1 bg-transparent text-[17px] text-patient-ink outline-none placeholder:text-patient-muted/50"
            />
          </div>
        </label>

        <div className="mt-8">
          <Button
            className={`w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full ${isHindi ? 'hindi' : ''}`}
            onClick={handleStart}
          >
            {isHindi ? 'आगे बढ़ें →' : `${s.getStarted} →`}
          </Button>
          <p className="mono-tag text-patient-muted text-[10px] text-center mt-4">
            OTP CONFIRMS YOUR IDENTITY · NO PASSWORD
          </p>
        </div>
      </div>
    </PatientLayout>
  );
}
