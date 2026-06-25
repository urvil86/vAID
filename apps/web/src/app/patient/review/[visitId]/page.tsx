'use client';

import { useParams, useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { StructuredNote } from '@/lib/types';
import { useState, useEffect } from 'react';
import { getStrings, LANG_STORAGE_KEY } from '@/lib/i18n';

export default function PatientReviewPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.visitId as string;
  const [language, setLanguage] = useState('Hindi');

  useEffect(() => {
    const lang = localStorage.getItem(LANG_STORAGE_KEY);
    if (lang) setLanguage(lang);
  }, []);

  const s = getStrings(language);
  const isHindi = language === 'Hindi';

  const { data: session, isLoading } = useQuery({
    queryKey: ['intake-session', visitId],
    queryFn: async () => {
      const res = await fetch(`/api/intake/session?visitId=${visitId}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json();
    },
  });

  const structureMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch('/api/intake/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      return res.json();
    },
  });

  const note: StructuredNote | null = session?.structured_note_json || null;

  if (isLoading || (session && !note && !structureMutation.data)) {
    if (session && !note && !structureMutation.isPending && !structureMutation.isSuccess) {
      structureMutation.mutate(session.id);
    }
    return (
      <PatientLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <Loader2 className="w-10 h-10 text-patient-accent" />
          <p className={`text-xl font-bold ${isHindi ? 'hindi' : ''}`}>{s.organizingText}</p>
          <p className="text-patient-muted">{s.organizingSubtext}</p>
        </div>
      </PatientLayout>
    );
  }

  const finalNote = note || structureMutation.data;

  return (
    <PatientLayout>
      <div className="flex-1 p-6 flex flex-col">
        <div className="mb-8">
          <p className="mono-tag text-patient-muted mb-2">{s.reviewLabel}</p>
          <h1 className={`text-2xl font-bold ${isHindi ? 'hindi' : ''}`}>{s.reviewHeading}</h1>
          <p className={`text-patient-muted mt-1 ${isHindi ? 'hindi text-base' : 'text-sm'}`}>
            {s.reviewSubheading}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pb-8">
          <ReviewCard
            label={s.chiefComplaint}
            value={finalNote?.chief_complaint}
            isHindi={isHindi}
          />
          <ReviewCard label={s.duration} value={finalNote?.duration} isHindi={isHindi} />
          <ReviewCard label={s.severity} value={finalNote?.severity} isHindi={isHindi} />
          <ReviewCard
            label={s.medications}
            items={finalNote?.current_medications}
            isHindi={isHindi}
          />
          <ReviewCard label={s.allergies} items={finalNote?.allergies} isHindi={isHindi} />
        </div>

        <div className="pt-6">
          <Button
            className={`w-full h-14 bg-patient-accent hover:bg-patient-accent/90 text-white text-lg font-bold rounded-full ${isHindi ? 'hindi' : ''}`}
            onClick={() => router.push('/patient/success')}
          >
            {s.confirmButton}
          </Button>
        </div>
      </div>
    </PatientLayout>
  );
}

function ReviewCard({
  label,
  value,
  items,
  isHindi,
}: {
  label: string;
  value?: string;
  items?: string[];
  isHindi: boolean;
}) {
  if (!value && (!items || items.length === 0)) return null;
  return (
    <Card className="bg-patient-card border-patient-border">
      <CardContent className="p-4">
        <p className="mono-tag text-patient-muted text-[10px] mb-2">{label}</p>
        {value && <p className={`text-lg font-medium ${isHindi ? 'hindi' : ''}`}>{value}</p>}
        {items && items.length > 0 && (
          <ul className="list-disc list-inside space-y-1">
            {items.map((item, i) => (
              <li key={i} className={`text-lg ${isHindi ? 'hindi' : ''}`}>
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
