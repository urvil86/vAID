'use client';

import { useState, useEffect } from 'react';
import PatientLayout from '@/components/PatientLayout';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';

export default function PatientSuccessPage() {
  const router = useRouter();
  const [language, setLanguage] = useState('Hindi');

  useEffect(() => {
    const lang = localStorage.getItem(LANG_STORAGE_KEY);
    if (lang) setLanguage(lang);
  }, []);

  const s = getStrings(language);
  const isHindi = language === 'Hindi';

  return (
    <PatientLayout>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="w-20 h-20 text-green-500 mb-6" />
        <h1 className={`text-3xl font-bold mb-3 ${isHindi ? 'hindi' : ''}`}>{s.successHeading}</h1>
        <p className={`text-patient-muted text-lg mb-2 ${isHindi ? 'hindi' : ''}`}>
          {s.successSubheading}
        </p>
        <p className="text-patient-muted text-base mb-10">{s.successNote}</p>
        <Button
          className={`w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full ${isHindi ? 'hindi' : ''}`}
          onClick={() => router.push('/patient/history')}
        >
          {isHindi ? 'संपन्न' : 'Done'}
        </Button>
      </div>
    </PatientLayout>
  );
}
