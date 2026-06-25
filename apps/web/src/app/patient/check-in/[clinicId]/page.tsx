'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const { data: session } = authClient.useSession();

  // Restore last-used language from storage
  useEffect(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved) setLanguage(saved);
  }, []);

  const s = getStrings(language);

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['clinic', clinicId],
    queryFn: async () => {
      const res = await fetch(`/api/clinics/${clinicId}`);
      if (!res.ok) throw new Error('Clinic not found');
      return res.json();
    },
  });

  const handleLanguageSelect = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  };

  const handleStart = () => {
    // Persist language choice before navigating
    localStorage.setItem(LANG_STORAGE_KEY, language);
    if (session || DEV_AUTH_BYPASS) {
      router.push(`/patient/consent/${clinicId}`);
    } else {
      router.push(`/account/signin?callbackUrl=/patient/consent/${clinicId}`);
    }
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

  const isHindi = language === 'Hindi';

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        {/* Clinic branding */}
        <div className="mb-10">
          <div className="w-16 h-16 bg-patient-border/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-black text-patient-accent">V</span>
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${isHindi ? 'hindi' : ''}`}>
            {clinic?.name || 'Clinic'}
          </h1>
          <p className={`text-patient-muted ${isHindi ? 'hindi' : ''}`}>{s.checkInSubtitle}</p>
        </div>

        {/* Language selector — the ONE place it appears */}
        <Card className="w-full bg-patient-card border-patient-border mb-8">
          <CardContent className="p-6">
            <p className="mono-tag text-patient-muted mb-4">{s.selectLanguage}</p>
            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_LANGUAGES.map((lang) => {
                const selected = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`h-16 rounded-xl text-lg font-semibold border-2 transition-all duration-200 ${
                      selected
                        ? 'bg-patient-accent text-white border-patient-accent shadow-md'
                        : 'bg-transparent text-patient-ink border-patient-border hover:border-patient-accent/50'
                    }`}
                  >
                    <span className="block">{lang.nativeLabel}</span>
                    {lang.nativeLabel !== lang.label && (
                      <span className="block text-xs mt-0.5 opacity-70">{lang.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full"
          onClick={handleStart}
        >
          {s.getStarted}
        </Button>

        <p className={`mt-6 text-sm text-patient-muted ${isHindi ? 'hindi' : ''}`}>
          {s.privacyNote}
        </p>
      </div>
    </PatientLayout>
  );
}
