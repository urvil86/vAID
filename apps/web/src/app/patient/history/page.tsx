'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PatientLayout from '@/components/PatientLayout';
import { Card, CardContent } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileText } from 'lucide-react';

type PatientVisit = {
  id: string;
  token_no: string;
  status: string;
  created_at: string;
  clinic_name?: string;
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
      const res = await fetch(`/api/visits?patientId=${patientId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId,
  });

  if (isPending || (patientId && isLoading)) {
    return (
      <PatientLayout>
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
        <div className="mb-6">
          <p className="mono-tag text-patient-muted mb-1">YOUR VISITS</p>
          <h1 className="text-2xl font-bold text-patient-ink">Visit history</h1>
        </div>

        {list.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-patient-muted">
            <FileText className="w-10 h-10" />
            <p>No visits yet. Scan your clinic&apos;s QR code to check in.</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1 overflow-y-auto pb-6">
            {list.map((v) => (
              <Card key={v.id} className="bg-patient-card border-patient-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="mono-tag text-patient-muted text-[10px]">
                      {v.token_no} · {v.clinic_name || 'Clinic'}
                    </p>
                    <span className="mono-tag text-[10px] text-patient-accent">{v.status}</span>
                  </div>
                  <p className="font-bold text-patient-ink">
                    {v.structured_note_json?.chief_complaint || 'Intake recorded'}
                  </p>
                  <p className="text-patient-muted text-xs mt-1" suppressHydrationWarning>
                    {new Date(v.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PatientLayout>
  );
}
